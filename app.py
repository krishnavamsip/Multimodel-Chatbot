from flask import Flask, request, Response, jsonify
from flask_cors import CORS
import requests
import os

app = Flask(__name__)

# Enable CORS for all routes so GitHub Pages can communicate with Render
CORS(app)

# The NVIDIA API endpoint
NVIDIA_API_URL = "https://integrate.api.nvidia.com/v1/chat/completions"

@app.route('/api/chat', methods=['POST'])
def chat():
    # 1. Securely get the API key from Render's Environment Variables
    api_key = os.environ.get("NVIDIA_API_KEY")
    if not api_key:
        return jsonify({"error": "Server configuration error: API Key missing."}), 500

    # 2. Get the incoming prompt and history from your frontend
    data = request.json
    if not data:
        return jsonify({"error": "Invalid request payload"}), 400

    # 3. Force streaming and usage stats on the backend side
    data['stream'] = True
    data['stream_options'] = {"include_usage": True}

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream"
    }

    # 4. Proxy the streaming response from NVIDIA back to your frontend
    def generate():
        try:
            response = requests.post(
                NVIDIA_API_URL,
                headers=headers,
                json=data,
                stream=True
            )
            response.raise_for_status()

            # Pass each chunk of the stream exactly as it arrives
            for chunk in response.iter_content(chunk_size=1024):
                if chunk:
                    yield chunk
                    
        except requests.exceptions.RequestException as e:
            # If NVIDIA throws an error, send it back gracefully
            yield f"data: {{\"error\": \"{str(e)}\"}}\n\n".encode('utf-8')

    return Response(generate(), mimetype='text/event-stream')

# Health check route (Optional, but good for testing if Render is awake)
@app.route('/', methods=['GET'])
def home():
    return "Ragnar Backend is Live and Running!", 200

if __name__ == '__main__':
    # Use port 5000 or whatever port Render assigns
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)