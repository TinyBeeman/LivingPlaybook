import http.server
import socketserver
import os

PORT = 8000
SCRIPT_DIRECTORY = os.path.dirname(os.path.abspath(__file__))
# The files to serve live at ../src/
DIRECTORY = os.path.join(SCRIPT_DIRECTORY, "..", "src")

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def log_message(self, format, *args):
        print(f"{self.client_address[0]} - - [{self.log_date_time_string()}] {format % args}")

    def send_error(self, code, message=None, explain=None):
        print(f"Error {code}: {self.path}")
        super().send_error(code, message, explain)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

if __name__ == "__main__":
    os.chdir(DIRECTORY)
    # Output the path of DIRECTORY
    print(f"Serving files from {DIRECTORY}")
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"Serving at port {PORT}")
        httpd.serve_forever()
