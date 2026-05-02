from flask import Flask, request, Response, jsonify
from flask_cors import CORS
import requests
import os

app = Flask(__name__)
# Allow the frontend to talk to this server
CORS(app)

NVIDIA_API_URL = "https://integrate.api.nvidia.com/v1/chat/completions"

@app.route('/api/chat', methods=['POST'])
def chat():
    api_key = os.environ.get("NVIDIA_API_KEY")
    if not api_key:
        return jsonify({"error": "Server configuration error: API Key missing."}), 500

    data = request.json
    if not data:
        return jsonify({"error": "Invalid request payload"}), 400

    # Force streaming and usage stats
    data['stream'] = True
    data['stream_options'] = {"include_usage": True}

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream"
    }

    def generate():
        try:
            response = requests.post(
                NVIDIA_API_URL,
                headers=headers,
                json=data,
                stream=True
            )
            response.raise_for_status()

            for chunk in response.iter_content(chunk_size=1024):
                if chunk:
                    yield chunk
                    
        except requests.exceptions.RequestException as e:
            yield f"data: {{\"error\": \"{str(e)}\"}}\n\n".encode('utf-8')

    return Response(generate(), mimetype='text/event-stream')

@app.route('/', methods=['GET'])
def home():
    return "Ragnar Backend is Live!", 200

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)