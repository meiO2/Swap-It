
    "use client";

    import { useEffect, useRef, useState } from "react";
    import {
    BrowserMultiFormatReader,
    type IScannerControls,
    } from "@zxing/browser";

    type HubCameraScannerProps = {
    onScan: (value: string) => void;
    };

    export default function HubCameraScanner({
    onScan,
    }: HubCameraScannerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const onScanRef = useRef(onScan);
    const [error, setError] = useState("");
    const [scanning, setScanning] = useState(true);

    useEffect(() => {
        onScanRef.current = onScan;
    }, [onScan]);

    useEffect(() => {
        const reader = new BrowserMultiFormatReader();
        let controls: IScannerControls | undefined;
        let cancelled = false;
        let scanned = false;

        async function startScanner() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();

            const cameras = devices.filter(
            (device) => device.kind === "videoinput"
            );

            if (!cameras.length) {
            throw new Error("No camera was detected by your browser.");
            }

            const preferredCamera =
            cameras.find((camera) =>
                /back|rear|environment/i.test(camera.label)
            ) || cameras[0];

            const scannerControls = await reader.decodeFromVideoDevice(
            preferredCamera.deviceId,
            videoRef.current!,
            (result) => {
                if (result && !scanned) {
                scanned = true;
                onScanRef.current(result.getText());
                setScanning(false);
                controls?.stop();
                }
            }
            );

            controls = scannerControls;

            if (cancelled) {
            scannerControls.stop();
            }
        } catch (err) {
            setError(
            err instanceof Error
                ? err.message
                : "Unable to initialize the camera."
            );
            setScanning(false);
        }
        }

        startScanner();

        return () => {
        cancelled = true;
        controls?.stop();
        };
    }, []);

    return (
        <div className="space-y-3">
        <div className="overflow-hidden rounded-xl bg-black">
            <video
            ref={videoRef}
            className="aspect-video w-full object-cover"
            autoPlay
            muted
            playsInline
            />
        </div>

        {error ? (
            <p className="text-sm text-red-600">{error}</p>
        ) : (
            <p className="text-sm text-ink-muted">
            {scanning
                ? "Point your camera at the Swap Hub QR code..."
                : "QR code detected."}
            </p>
        )}
        </div>
    );
    }
