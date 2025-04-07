from http.server import BaseHTTPRequestHandler, HTTPServer
import json
from urllib.parse import urlparse, parse_qs
import numpy as np
from scipy.fft import fft
from scipy.signal import find_peaks

class TunerHandler(BaseHTTPRequestHandler):
    def _set_headers(self, status=200):
        self.send_response(status)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
    
    def do_GET(self):
        parsed_path = urlparse(self.path)
        if parsed_path.path == '/api/tuner':
            query = parse_qs(parsed_path.query)
            self.handle_tuner_request(query)
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({'error': 'Not found'}).encode())
    
    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        
        try:
            data = json.loads(post_data.decode())
            if self.path == '/api/analyze':
                self.handle_analyze_request(data)
            else:
                self._set_headers(404)
                self.wfile.write(json.dumps({'error': 'Not found'}).encode())
        except json.JSONDecodeError:
            self._set_headers(400)
            self.wfile.write(json.dumps({'error': 'Invalid JSON'}).encode())
    
    def handle_tuner_request(self, query):
        instrument = query.get('instrument', ['guitar'])[0]
        
        # Standard tunings for various instruments
        tunings = {
            'guitar': ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'],
            'bass': ['E1', 'A1', 'D2', 'G2'],
            'violin': ['G3', 'D4', 'A4', 'E5'],
            'cello': ['C2', 'G2', 'D3', 'A3'],
            'ukulele': ['G4', 'C4', 'E4', 'A4']
        }
        
        if instrument in tunings:
            response = {
                'instrument': instrument,
                'tuning': tunings[instrument],
                'message': f"Standard tuning for {instrument} is {', '.join(tunings[instrument])}"
            }
            self._set_headers()
            self.wfile.write(json.dumps(response).encode())
        else:
            self._set_headers(400)
            self.wfile.write(json.dumps({'error': 'Unknown instrument'}).encode())
    
    def handle_analyze_request(self, data):
        audio_data = data.get('audio')
        sample_rate = data.get('sample_rate', 44100)
        
        if not audio_data or len(audio_data) == 0:
            self._set_headers(400)
            self.wfile.write(json.dumps({'error': 'No audio data provided'}).encode())
            return
        
        try:
            # Convert audio data to numpy array
            audio_np = np.array(audio_data, dtype=np.float32)
            
            # Perform FFT to find frequencies
            n = len(audio_np)
            yf = fft(audio_np)
            xf = np.linspace(0.0, sample_rate/2.0, n//2)
            
            # Find peaks in the frequency spectrum
            peaks, _ = find_peaks(np.abs(yf[:n//2]), height=0.1)
            if len(peaks) == 0:
                self._set_headers(200)
                self.wfile.write(json.dumps({
                    'error': 'No detectable pitch',
                    'message': 'Could not detect a clear pitch. Please play a single note.'
                }).encode())
                return
            
            # Get the strongest frequency
            max_peak = peaks[np.argmax(np.abs(yf[peaks]))]
            frequency = xf[max_peak]
            
            # Find the closest note
            note_info = self.find_closest_note(frequency)
            
            response = {
                'frequency': float(frequency),
                'note': note_info['note'],
                'cents': note_info['cents'],
                'message': self.get_tuning_feedback(note_info['cents'])
            }
            
            self._set_headers()
            self.wfile.write(json.dumps(response).encode())
            
        except Exception as e:
            self._set_headers(500)
            self.wfile.write(json.dumps({'error': str(e)}).encode())
    
    def find_closest_note(self, frequency):
        # Find the closest note and how many cents off it is
        note_names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
        A4 = 440.0
        semitone_ratio = 2.0 ** (1.0/12.0)
        
        # Calculate how many semitones away from A4
        semitones_from_A4 = 12.0 * np.log2(frequency / A4)
        rounded_semitones = round(semitones_from_A4)
        cents = 100.0 * (semitones_from_A4 - rounded_semitones)
        
        # Find the note name
        note_index = int(rounded_semitones % 12)
        note_name = note_names[note_index]
        
        # Calculate the octave
        octave = int(rounded_semitones // 12 + 4)
        
        return {
            'note': f"{note_name}{octave}",
            'cents': float(cents)
        }
    
    def get_tuning_feedback(self, cents):
        cents_abs = abs(cents)
        if cents_abs < 5:
            return "Perfectly in tune!"
        elif cents_abs < 20:
            return "Close, but could be more precise."
        elif cents < 0:
            return "Flat - tighten the string to raise the pitch."
        else:
            return "Sharp - loosen the string to lower the pitch."

def run(server_class=HTTPServer, handler_class=TunerHandler, port=8000):
    server_address = ('', port)
    httpd = server_class(server_address, handler_class)
    print(f'Starting tuner server on port {port}...')
    httpd.serve_forever()

if __name__ == '__main__':
    run()
