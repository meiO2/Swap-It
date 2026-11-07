
    "use client";

    import { useEffect, useState } from "react";
    import QRCode from "qrcode";

    type HubAccessQRCodeProps = {
    token: string;
    expiresAt: string;
    };

    export default function HubAccessQRCode({
    token,
    expiresAt,
    }: HubAccessQRCodeProps) {
    const [qrImage, setQrImage] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;

        async function generateQRCode() {
        try {
            const image = await QRCode.toDataURL(token, {
            width: 280,
            margin: 2,
            errorCorrectionLevel: "M",
            });

            if (!cancelled) {
            setQrImage(image);
            setError("");
            }
        } catch {
            if (!cancelled) {
            setError("Failed to generate QR code.");
            }
        }
        }

        if (token) {
        generateQRCode();
        }

        return () => {
        cancelled = true;
        };
    }, [token]);

    return (
        <div className="flex flex-col items-center gap-4 rounded-xl border p-6">
        <h2 className="text-lg font-semibold">Hub Access QR Code</h2>

        {qrImage ? (
            <img
            src={qrImage}
            alt="Temporary hub access QR code"
            className="h-[280px] w-[280px]"
            />
        ) : (
            <div className="flex h-[280px] w-[280px] items-center justify-center rounded-lg bg-gray-100">
            {error || "Generating QR code..."}
            </div>
        )}

        <p className="text-center text-sm text-gray-500">
            This QR code is temporary and can only be used once.
        </p>

        <p className="text-center text-xs text-gray-400">
            Expires: {new Date(expiresAt).toLocaleString()}
        </p>
        </div>
    );
    }
