import os
import base64
import io
import datetime
from flask import Flask, request, send_file, jsonify, send_from_directory, redirect, url_for
from flask_cors import CORS
from PIL import Image
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

# --- AUTH & DB IMPORTS ---
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from authlib.integrations.flask_client import OAuth

app = Flask(__name__)
app.secret_key = "REPLACE_WITH_A_REAL_SECRET_KEY"
CORS(app)

# --- DATABASE SETUP ---
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///vault.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# --- LOGIN MANAGER ---
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

# --- OAUTH SETUP ---
oauth = OAuth(app)

# 1. GOOGLE CONFIG
app.config['GOOGLE_CLIENT_ID'] = 'YOUR_GOOGLE_CLIENT_ID_HERE'
app.config['GOOGLE_CLIENT_SECRET'] = 'YOUR_GOOGLE_CLIENT_SECRET_HERE'

google = oauth.register(
    name='google',
    client_id=app.config['GOOGLE_CLIENT_ID'],
    client_secret=app.config['GOOGLE_CLIENT_SECRET'],
    access_token_url='https://accounts.google.com/o/oauth2/token',
    authorize_url='https://accounts.google.com/o/oauth2/auth',
    api_base_url='https://www.googleapis.com/oauth2/v1/',
    client_kwargs={'scope': 'openid email profile'},
)

# 2. GITHUB CONFIG
app.config['GITHUB_CLIENT_ID'] = 'YOUR_GITHUB_CLIENT_ID_HERE'
app.config['GITHUB_CLIENT_SECRET'] = 'YOUR_GITHUB_CLIENT_SECRET_HERE'

github = oauth.register(
    name='github',
    client_id=app.config['GITHUB_CLIENT_ID'],
    client_secret=app.config['GITHUB_CLIENT_SECRET'],
    access_token_url='https://github.com/login/oauth/access_token',
    authorize_url='https://github.com/login/oauth/authorize',
    api_base_url='https://api.github.com/',
    client_kwargs={'scope': 'user:email'},
)

# --- MODELS ---
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(150), unique=True, nullable=False)
    password = db.Column(db.String(150), nullable=True) 
    name = db.Column(db.String(150))
    auth_type = db.Column(db.String(50)) 

class History(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    action = db.Column(db.String(50)) 
    filename = db.Column(db.String(200))
    timestamp = db.Column(db.DateTime, default=datetime.datetime.utcnow)

with app.app_context():
    db.create_all()

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# --- AUTH ROUTES ---
@app.route('/api/status')
def auth_status():
    if current_user.is_authenticated:
        return jsonify({'isLoggedIn': True, 'name': current_user.name})
    return jsonify({'isLoggedIn': False})

@app.route('/auth/register', methods=['POST'])
def register():
    data = request.json
    if User.query.filter_by(email=data['email']).first():
        return jsonify({'error': 'Email already exists'}), 400
    
    hashed_pw = generate_password_hash(data['password'], method='scrypt')
    new_user = User(email=data['email'], password=hashed_pw, name=data['name'], auth_type='local')
    db.session.add(new_user)
    db.session.commit()
    login_user(new_user)
    return jsonify({'success': True})

@app.route('/auth/login', methods=['POST'])
def login():
    data = request.json
    user = User.query.filter_by(email=data['email']).first()
    if user and check_password_hash(user.password, data['password']):
        login_user(user)
        return jsonify({'success': True})
    return jsonify({'error': 'Invalid credentials'}), 401

@app.route('/auth/logout')
@login_required
def logout():
    logout_user()
    return jsonify({'success': True})

# --- OAUTH CALLBACKS ---
@app.route('/google/login')
def google_login():
    redirect_uri = url_for('google_authorize', _external=True)
    return google.authorize_redirect(redirect_uri)

@app.route('/google/callback')
def google_authorize():
    token = google.authorize_access_token()
    user_info = google.get('userinfo').json()
    user = User.query.filter_by(email=user_info['email']).first()
    if not user:
        user = User(email=user_info['email'], name=user_info['name'], auth_type='google')
        db.session.add(user)
        db.session.commit()
    login_user(user)
    return redirect('/')

@app.route('/github/login')
def github_login():
    redirect_uri = url_for('github_authorize', _external=True)
    return github.authorize_redirect(redirect_uri)

@app.route('/github/callback')
def github_authorize():
    token = github.authorize_access_token()
    # GitHub requires special handling to get the email if it's private
    resp = github.get('user')
    user_info = resp.json()
    email = user_info.get('email')
    
    if not email:
        emails = github.get('user/emails').json()
        for e in emails:
            if e['primary']:
                email = e['email']
                break
    
    user = User.query.filter_by(email=email).first()
    if not user:
        user = User(
            email=email,
            name=user_info.get('name') or user_info.get('login'),
            auth_type='github'
        )
        db.session.add(user)
        db.session.commit()
    login_user(user)
    return redirect('/')

# --- CORE LOGIC ---
@app.route('/api/history', methods=['GET'])
def get_history():
    if not current_user.is_authenticated:
        return jsonify({'error': 'Unauthorized'}), 401
    logs = History.query.filter_by(user_id=current_user.id).order_by(History.timestamp.desc()).limit(20).all()
    output = [{'action': l.action, 'filename': l.filename, 'timestamp': l.timestamp.strftime("%Y-%m-%d %H:%M")} for l in logs]
    return jsonify(output)

DELIMITER = "#####END#####"
LOCKED_FLAG = "#####LOCKED#####"

def get_key(password):
    salt = b'salt_for_demo_only' 
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=100000)
    return base64.urlsafe_b64encode(kdf.derive(password.encode()))

@app.route('/')
def index(): return send_from_directory('static', 'index.html')
@app.route('/<path:path>')
def static_files(path): return send_from_directory('static', path)

@app.route('/api/encode', methods=['POST'])
def encode():
    try:
        if 'image' not in request.files or 'message' not in request.form: return jsonify({"error": "Missing input"}), 400
        image_file, message, password = request.files['image'], request.form['message'], request.form.get('password', '')

        final_payload = (LOCKED_FLAG + Fernet(get_key(password)).encrypt(message.encode()).decode() + DELIMITER) if password else (message + DELIMITER)
        
        img = Image.open(image_file).convert('RGB')
        pixels = img.load()
        binary_msg = ''.join(format(byte, '08b') for byte in final_payload.encode('utf-8'))
        
        if len(binary_msg) > img.width * img.height: return jsonify({"error": "Data too large"}), 400
        
        idx = 0
        for y in range(img.height):
            for x in range(img.width):
                if idx < len(binary_msg):
                    r, g, b = pixels[x, y]
                    pixels[x, y] = ((r & ~1) | int(binary_msg[idx]), g, b)
                    idx += 1
                else: break

        if current_user.is_authenticated:
            db.session.add(History(user_id=current_user.id, action='encode', filename=image_file.filename))
            db.session.commit()

        img_io = io.BytesIO()
        img.save(img_io, 'PNG')
        img_io.seek(0)
        return send_file(img_io, mimetype='image/png', as_attachment=True, download_name='vault_secured.png')
    except Exception as e: return jsonify({"error": "Encoding Failed"}), 500

@app.route('/api/decode', methods=['POST'])
def decode():
    try:
        if 'image' not in request.files: return jsonify({"error": "Missing image"}), 400
        image_file, password = request.files['image'], request.form.get('password', '')
        
        img = Image.open(image_file).convert('RGB')
        pixels = img.load()
        
        binary_data = ""
        for y in range(img.height):
            for x in range(img.width):
                binary_data += str(pixels[x, y][0] & 1)

        all_bytes = [int(binary_data[i:i+8], 2) for i in range(0, len(binary_data), 8)]
        decoded_str = bytearray(all_bytes).decode('utf-8', errors='ignore')
        
        if DELIMITER in decoded_str:
            content = decoded_str.split(DELIMITER)[0]
            if current_user.is_authenticated:
                db.session.add(History(user_id=current_user.id, action='decode', filename=image_file.filename))
                db.session.commit()

            if content.startswith(LOCKED_FLAG):
                if not password: return jsonify({"error": "🔒 LOCKED. PASSWORD REQUIRED."}), 403
                try: return jsonify({"message": Fernet(get_key(password)).decrypt(content[len(LOCKED_FLAG):].encode()).decode()})
                except: return jsonify({"error": "⛔ WRONG PASSWORD"}), 403
            return jsonify({"message": content})
            
        return jsonify({"error": "No hidden message found."}), 400
    except Exception as e: return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)