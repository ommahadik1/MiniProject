import os
import base64
import io
# 1. IMPORTS MUST BE FIRST
from flask import Flask, request, send_file, jsonify, send_from_directory
from flask_cors import CORS
from PIL import Image
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

# 2. CREATE APP INSTANCE IMMEDIATELY AFTER IMPORTS
app = Flask(__name__)
CORS(app)

# 3. CONFIGURATION & HELPERS
DELIMITER = "#####END#####"
LOCKED_FLAG = "#####LOCKED#####"

def get_key(password):
    salt = b'salt_for_demo_only' 
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=100000,
    )
    return base64.urlsafe_b64encode(kdf.derive(password.encode()))

# 4. ROUTES
@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('static', path)

@app.route('/api/encode', methods=['POST'])
def encode():
    try:
        print("--- STARTING ENCRYPTION ---")
        if 'image' not in request.files or 'message' not in request.form:
            return jsonify({"error": "Missing image or message"}), 400

        image_file = request.files['image']
        secret_message = request.form['message']
        password = request.form.get('password', '')
        
        print(f"Image received: {image_file.filename}")

        if password:
            key = get_key(password)
            f = Fernet(key)
            encrypted_bytes = f.encrypt(secret_message.encode())
            final_payload = LOCKED_FLAG + encrypted_bytes.decode() + DELIMITER
        else:
            final_payload = secret_message + DELIMITER

        # Convert to RGB (removes transparency issues)
        img = Image.open(image_file).convert('RGB')
        pixels = img.load()
        
        msg_bytes = final_payload.encode('utf-8')
        binary_message = ''.join(format(byte, '08b') for byte in msg_bytes)
        
        data_len = len(binary_message)
        width, height = img.size
        print(f"Payload Size: {data_len} bits. Image Capacity: {width*height} pixels.")
        
        if data_len > width * height:
            return jsonify({"error": f"Data too large. Use larger image."}), 400
        
        idx = 0
        for y in range(height):
            for x in range(width):
                if idx < data_len:
                    r, g, b = pixels[x, y]
                    digit = int(binary_message[idx])
                    r = (r & ~1) | digit 
                    pixels[x, y] = (r, g, b)
                    idx += 1
                else:
                    break
            if idx >= data_len:
                break

        img_io = io.BytesIO()
        img.save(img_io, 'PNG') # ALWAYS PNG
        img_io.seek(0)
        return send_file(img_io, mimetype='image/png', as_attachment=True, download_name='vault_secured.png')

    except Exception as e:
        print(f"Encode Error: {e}")
        return jsonify({"error": "Encryption Failed"}), 500

@app.route('/api/decode', methods=['POST'])
def decode():
    try:
        print("--- STARTING DECRYPTION ---")
        if 'image' not in request.files:
            return jsonify({"error": "Missing image"}), 400

        image_file = request.files['image']
        password = request.form.get('password', '')
        print(f"Decoding file: {image_file.filename}")
        
        img = Image.open(image_file).convert('RGB')
        pixels = img.load()
        
        extracted_bits = ""
        decoded_bytes = bytearray()
        found = False
        
        for y in range(img.height):
            if found: break 
            for x in range(img.width):
                r, _, _ = pixels[x, y]
                extracted_bits += str(r & 1)

                if len(extracted_bits) == 8:
                    new_byte = int(extracted_bits, 2)
                    decoded_bytes.append(new_byte)
                    extracted_bits = ""
                    
                    if len(decoded_bytes) >= len(DELIMITER):
                        tail_bytes = decoded_bytes[-len(DELIMITER):]
                        try:
                            if tail_bytes.decode('utf-8', errors='ignore') == DELIMITER:
                                found = True
                                break
                        except:
                            pass
        
        if not found:
            print("ERROR: Delimiter not found. Data likely corrupted by compression.")
            return jsonify({"error": "No hidden message found."}), 400

        full_content = decoded_bytes[:-len(DELIMITER)].decode('utf-8', errors='ignore')

        if full_content.startswith(LOCKED_FLAG):
            if not password:
                return jsonify({"error": "🔒 LOCKED ARTIFACT. PASSWORD REQUIRED."}), 403
            try:
                key = get_key(password)
                f = Fernet(key)
                original_message = f.decrypt(full_content[len(LOCKED_FLAG):].encode()).decode()
                return jsonify({"message": original_message})
            except:
                return jsonify({"error": "⛔ WRONG PASSWORD"}), 403
        
        elif full_content.startswith("gAAAAA"):
             # Legacy check
            if not password: return jsonify({"error": "🔒 PASSWORD REQUIRED."}), 403
            try:
                key = get_key(password)
                f = Fernet(key)
                msg = f.decrypt(full_content.encode()).decode()
                return jsonify({"message": msg})
            except:
                return jsonify({"error": "⛔ WRONG PASSWORD"}), 403

        else:
            if password: return jsonify({"error": "⚠️ FILE NOT ENCRYPTED."}), 400
            return jsonify({"message": full_content})

    except Exception as e:
        print(f"Decode Error: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    if not os.path.exists('static'): os.makedirs('static')
    app.run(debug=True, port=5000)