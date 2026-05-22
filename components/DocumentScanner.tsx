"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../utils/supabase";

type CaseOption = { id: string; case_title: string };

type Props = {
  cases: CaseOption[];
  onClose: () => void;
  onSaved: () => void;
  defaultCaseId?: string;
};

export default function DocumentScanner({ cases, onClose, onSaved, defaultCaseId = "" }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [caseId, setCaseId] = useState(defaultCaseId);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("Camera not supported. Use Upload Photo below.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.setAttribute("playsinline", "true");
          video.muted = true;
          await video.play();
          setCameraReady(true);
          setCameraError(null);
        }
      } catch {
        setCameraError("Allow camera access in browser settings, or use Upload Photo.");
        setCameraReady(false);
      }
    }

    startCamera();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, []);

  const saveImageBlob = async (blob: Blob, fileName: string) => {
    if (!caseId) {
      alert("Please select a case first.");
      return;
    }
    setIsSaving(true);
    const path = `${caseId}/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

    const { error: uploadError } = await supabase.storage
      .from("case-documents")
      .upload(path, blob, { contentType: blob.type || "image/jpeg", upsert: false });

    let fileUrl: string | null = null;
    if (!uploadError) {
      const { data } = supabase.storage.from("case-documents").getPublicUrl(path);
      fileUrl = data.publicUrl;
    }

    const { error: dbError } = await supabase.from("documents").insert([
      {
        case_id: caseId,
        file_name: fileName,
        file_url: fileUrl,
      },
    ]);

    setIsSaving(false);

    if (dbError) {
      alert(
        uploadError
          ? "Could not save document. Run supabase/setup-storage.sql in Supabase SQL Editor."
          : "Could not save document: " + dbError.message
      );
      return;
    }

    stopCamera();
    onSaved();
    onClose();
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !cameraReady) return;

    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) {
      alert("Camera still loading. Wait a moment and try again.");
      return;
    }

    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob(
      (blob) => {
        if (blob) saveImageBlob(blob, `scan-${Date.now()}.jpg`);
      },
      "image/jpeg",
      0.9
    );
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) saveImageBlob(file, file.name || `photo-${Date.now()}.jpg`);
    e.target.value = "";
  };

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black z-[60] flex flex-col">
      <div className="p-4 flex items-center gap-3 text-white shrink-0">
        <button type="button" onClick={handleClose} className="font-semibold text-[#e9c176] flex items-center gap-1 shrink-0">
          ← Back
        </button>
        <span className="text-lg font-serif text-[#e9c176] truncate flex-1">Scan Document</span>
      </div>

      <div className="px-4 pb-3 shrink-0">
        <label className="block text-xs text-gray-400 mb-1">Save to case</label>
        <select
          value={caseId}
          onChange={(e) => setCaseId(e.target.value)}
          className="w-full rounded-lg border border-[#e9c176]/50 bg-[#0A192F] text-white p-2.5 text-sm"
        >
          <option value="">-- Select case --</option>
          {cases.map((c) => (
            <option key={c.id} value={c.id}>
              {c.case_title}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 relative flex items-center justify-center min-h-0 px-4">
        <div className="relative w-full max-w-lg aspect-[3/4] max-h-full rounded-lg overflow-hidden bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`absolute inset-0 w-full h-full object-cover ${cameraReady ? "opacity-100" : "opacity-0"}`}
          />
          {!cameraReady && !cameraError && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
              Starting camera…
            </div>
          )}
          {cameraError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 gap-3">
              <p className="text-gray-300 text-sm">{cameraError}</p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="bg-[#e9c176] text-[#0A192F] px-4 py-2 rounded-lg font-semibold text-sm"
              >
                Upload Photo
              </button>
            </div>
          )}
          <div className="absolute inset-0 pointer-events-none border border-[#e9c176]/50">
            <div className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-[#e9c176]" />
            <div className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-[#e9c176]" />
            <div className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-[#e9c176]" />
            <div className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-[#e9c176]" />
          </div>
        </div>
        <canvas ref={canvasRef} className="hidden" />
      </div>

      <div className="p-6 pb-10 flex flex-col items-center gap-4 shrink-0 bg-black/90">
        <button
          type="button"
          onClick={capturePhoto}
          disabled={!cameraReady || isSaving || !caseId}
          className="w-20 h-20 rounded-full bg-white border-8 border-gray-400 focus:border-[#e9c176] disabled:opacity-40 transition-colors"
          aria-label="Capture photo"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isSaving}
          className="text-[#e9c176] text-sm font-semibold underline disabled:opacity-50"
        >
          {isSaving ? "Saving…" : "Upload from gallery instead"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFilePick}
        />
      </div>
    </div>
  );
}
