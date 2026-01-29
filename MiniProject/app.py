import os
import base64
from flask import Flask, request, send_file, jsonify, send_from_directory
from flask_cors import CORS
from PIL import Image
import io
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

app = Flask(__name__)
CORS(app)

# FLAGS
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

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('static', path)

@app.route('/api/encode', methods=['POST'])
def encode():
    try:
        if 'image' not in request.files or 'message' not in request.form:
            return jsonify({"error": "Missing image or message"}), 400

        image_file = request.files['image']
        secret_message = request.form['message']
        password = request.form.get('password', '')

        # 1. SECURITY LOGIC
        if password:
            key = get_key(password)
            f = Fernet(key)
            encrypted_bytes = f.encrypt(secret_message.encode())
            final_payload = LOCKED_FLAG + encrypted_bytes.decode() + DELIMITER
        else:
            final_payload = secret_message + DELIMITER

        # 2. IMAGE PROCESSING (Handle ANY format)
        # We open the image and ensure it's in RGB mode.
        # This handles JPG, BMP, GIF, WEBP automatically.
        img = Image.open(image_file)
        
        # If it has transparency (RGBA), paste it onto white background to make it RGB
        if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
            alpha = img.convert('RGBA').split()[-1]
            bg = Image.new("RGB", img.size, (255, 255, 255))
            bg.paste(img, mask=alpha)
            img = bg
        else:
            img = img.convert('RGB')

        pixels = img.load()
        
        msg_bytes = final_payload.encode('utf-8')
        binary_message = ''.join(format(byte, '08b') for byte in msg_bytes)
        
        data_len = len(binary_message)
        width, height = img.size
        
        if data_len > width * height:
            return jsonify({"error": f"Data too large ({data_len} bits). Use larger image."}), 400
        
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
        # ALWAYS save as PNG (Lossless) to preserve the hidden data
        img.save(img_io, 'PNG')
        img_io.seek(0)
        return send_file(img_io, mimetype='image/png', as_attachment=True, download_name='vault_secured.png')

    except Exception as e:
        print("Encode Error:", e)
        return jsonify({"error": "Encryption Failed"}), 500

@app.route('/api/decode', methods=['POST'])
def decode():
    try:
        if 'image' not in request.files:
            return jsonify({"error": "Missing image"}), 400

        image_file = request.files['image']
        password = request.form.get('password', '')
        
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
            return jsonify({"error": "No hidden message found."}), 400

        full_content = decoded_bytes[:-len(DELIMITER)].decode('utf-8', errors='ignore')

        if full_content.startswith(LOCKED_FLAG):
            if not password:
                return jsonify({"error": "🔒 LOCKED ARTIFACT. PASSWORD REQUIRED."}), 403
            
            encrypted_payload = full_content[len(LOCKED_FLAG):]
            try:
                key = get_key(password)
                f = Fernet(key)
                original_message = f.decrypt(encrypted_payload.encode()).decode()
                return jsonify({"message": original_message})
            except:
                return jsonify({"error": "⛔ ACCESS DENIED: WRONG PASSWORD"}), 403
        
        elif full_content.startswith("gAAAAA"):
            if not password:
                return jsonify({"error": "🔒 ENCRYPTED DATA DETECTED. PASSWORD REQUIRED."}), 403
            
            try:
                key = get_key(password)
                f = Fernet(key)
                original_message = f.decrypt(full_content.encode()).decode()
                return jsonify({"message": original_message})
            except:
                return jsonify({"error": " ACCESS DENIED: WRONG PASSWORD"}), 403

        else:
            if password:
                return jsonify({"error": "⚠️ WARNING: This file is NOT encrypted."}), 400
            
            return jsonify({"message": full_content})

    except Exception as e:
        print("Decode Error:", e)
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    if not os.path.exists('static'): os.makedirs('static')
    app.run(debug=True, port=5000)