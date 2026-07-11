import requests

url = "http://127.0.0.1:8000/api/v1/ai/health-overview"
payload = {
    "file_content": "def test():\n  pass\n",
    "language": "python",
    "cursor_line": 1,
    "model": "deepseek/deepseek-chat"
}
headers = {"Content-Type": "application/json"}

try:
    resp = requests.post(url, json=payload)  # type: ignore
    print("Status:", resp.status_code)
    print("Response:", resp.text)
except Exception as e:
    print("Error:", e)
