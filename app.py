from flask import Flask, request, Response, stream_with_context
from flask_cors import CORS
import requests
import os
import json
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY")
NVIDIA_API_URL = "https://integrate.api.nvidia.com/v1/chat/completions"

@app.route('/api/chat', methods=['POST'])
def chat():
    frontend_data = request.json
    
    # Force the API to stream the response back to us
    frontend_data['stream'] = True
    
    # This tells the API to send the token usage stats at the very end of the stream
    if 'stream_options' not in frontend_data:
        frontend_data['stream_options'] = {"include_usage": True}

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {NVIDIA_API_KEY}",
        "Accept": "text/event-stream" 
    }

    try:
        # Request with stream=True
        req = requests.post(NVIDIA_API_URL, headers=headers, json=frontend_data, stream=True)
        
        def generate():
            # iter_lines() processes the stream instantly line-by-line
            for line in req.iter_lines():
                if line:
                    yield line + b'\n\n'

        return Response(stream_with_context(generate()), content_type=req.headers.get('content-type', 'text/event-stream'))
        
    except Exception as e:
        return Response(json.dumps({"error": str(e)}), status=500, mimetype='application/json')

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)