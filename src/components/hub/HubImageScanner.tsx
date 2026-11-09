
    "use client";

    import { useRef, useState } from "react";
    import { BrowserMultiFormatReader } from "@zxing/browser";

    type HubImageScannerProps = {
    onScan: (value: string) => void;
    };

    export default function HubImageScanner({ onScan }: HubImageScannerProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [preview, setPreview] = useState("");
    const [status, setStatus] = useState("");
    const [error, setError] = useState("");

    async function handleImageUpload(
        event: React.ChangeEvent<HTMLInputElement>
    ) {
        const file = event.target.files?.[0];
        if (!file) return;

        setError("");
        setStatus("Reading QR code...");

        const imageUrl = URL.createObjectURL(file);
        setPreview(imageUrl);

        try {
        const image = new Image();

        image.src = imageUrl;

        await new Promise<void>((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = () => reject(new Error("Unable to load image."));
        });

        const reader = new BrowserMultiFormatReader();
        const result = await reader.decodeFromImageElement(image);

        const token = result.getText();

        if (!token.trim()) {
            throw new Error("The QR code does not contain a valid token.");
        }

        onScan(token);
        setStatus("QR code successfully detected.");
        } catch (err) {
        setStatus("");
        setError(
            err instanceof Error
            ? err.message
            : "Could not read the QR code from this image."
        );
        }
    }

    return (
        <div className="space-y-4">
        <input
            ref={inputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
        />

        <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-full rounded-xl border-2 border-dashed border-gray-300 p-6 text-center transition hover:border-primary"
        >
            <span className="block text-sm font-semibold text-ink">
            Upload QR code image
            </span>
            <span className="mt-1 block text-xs text-ink-muted">
            Choose a PNG, JPG, or other supported image
            </span>
        </button>

        {preview && (
            <div className="flex justify-center">
            <img
                src={preview}
                alt="Uploaded QR code"
                className="max-h-64 rounded-xl border border-gray-200 object-contain"
            />
            </div>
        )}

        {status && (
            <p className="text-sm text-green-700">{status}</p>
        )}

        {error && (
            <p className="text-sm text-red-600">{error}</p>
        )}
        </div>
    );
    }
