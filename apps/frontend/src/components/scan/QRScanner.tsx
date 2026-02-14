// components/scan/QRScanner.tsx
// Webcam QR code scanner using html5-qrcode.
// Doctor points their webcam at the patient's phone screen.

import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

export interface ScanQRPayload {
  action: 'scan_session';
  ephemeralPrivkey: string;
  sessionToken: string;
  repoId: string;
  expiresAt: number;
  endpoint: string;
}

interface QRScannerProps {
  onScan: (payload: ScanQRPayload) => void;
  onError: (message: string) => void;
}

export function QRScanner({ onScan, onError }: QRScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(false);
  const processedRef = useRef(false);

  const startScanning = async () => {
    if (!containerRef.current || scannerRef.current) return;

    try {
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 300, height: 300 },
        },
        (decodedText) => {
          if (processedRef.current) return;

          try {
            const payload = JSON.parse(decodedText) as ScanQRPayload;

            if (payload.action !== 'scan_session') {
              onError('Not a valid Limbo Health QR code.');
              return;
            }

            if (Date.now() > payload.expiresAt * 1000) {
              onError('This QR code has expired. Ask the patient to generate a new one.');
              return;
            }

            if (!payload.ephemeralPrivkey || !payload.sessionToken || !payload.repoId) {
              onError('Incomplete QR code data.');
              return;
            }

            processedRef.current = true;
            scanner.stop().catch(() => {});
            onScan(payload);
          } catch {
            // Not valid JSON — ignore, keep scanning
          }
        },
        () => {
          // QR not found in frame — normal, keep scanning
        },
      );

      setStarted(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (msg.includes('Permission')) {
        onError('Camera access is required to scan QR codes. Please allow camera access in your browser settings.');
      } else {
        onError(`Failed to start camera: ${msg}`);
      }
    }
  };

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        try {
          scannerRef.current.stop().catch(() => {});
        } catch {
          // already stopped
        }
        scannerRef.current = null;
      }
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-6">
      <div
        id="qr-reader"
        ref={containerRef}
        className="w-full max-w-md rounded-lg overflow-hidden bg-gray-900"
        style={{ minHeight: started ? undefined : '80px' }}
      />

      {!started && (
        <button
          onClick={startScanning}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3 rounded-lg transition-colors"
        >
          Start Camera
        </button>
      )}

      {started && (
        <p className="text-sm text-gray-500">
          Point your camera at the patient's QR code
        </p>
      )}
    </div>
  );
}