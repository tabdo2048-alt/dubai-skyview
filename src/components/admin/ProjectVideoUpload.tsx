import { useRef, useState } from "react";
import { Film, Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createProjectVideoUploadSignature } from "@/lib/cloudinary-video.functions";

const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const ACCEPTED_VIDEO_TYPES = new Set(["video/mp4", "video/webm"]);

type CloudinaryUploadResponse = {
  secure_url?: string;
  error?: { message?: string };
};

function uploadWithProgress(url: string, body: FormData, onProgress: (value: number) => void) {
  return new Promise<CloudinaryUploadResponse>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", url);
    request.responseType = "json";
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () => reject(new Error("Network error while uploading the video"));
    request.onload = () => {
      const response = request.response as CloudinaryUploadResponse | null;
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(response?.error?.message || "Cloudinary rejected the video"));
        return;
      }
      resolve(response ?? {});
    };
    request.send(body);
  });
}

export function ProjectVideoUpload({
  tenantId,
  value,
  onChange,
  onError,
}: {
  tenantId: string;
  value: string;
  onChange: (url: string) => void;
  onError: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!ACCEPTED_VIDEO_TYPES.has(file.type)) {
      onError("Choose an MP4 or WebM video");
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      onError("The video must be 100 MB or smaller");
      return;
    }

    setUploading(true);
    setProgress(0);
    try {
      const signed = await createProjectVideoUploadSignature({ data: { tenantId } });
      const body = new FormData();
      body.append("file", file);
      body.append("api_key", signed.apiKey);
      body.append("timestamp", String(signed.timestamp));
      body.append("signature", signed.signature);
      body.append("folder", signed.folder);
      body.append("public_id", signed.publicId);
      body.append("allowed_formats", signed.allowedFormats);

      const result = await uploadWithProgress(
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(signed.cloudName)}/video/upload`,
        body,
        setProgress,
      );
      if (!result.secure_url) throw new Error("Cloudinary did not return a video URL");
      onChange(result.secure_url);
      setProgress(100);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Video upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2 sm:col-span-2">
      <Label className="text-xs uppercase tracking-widest text-muted-foreground">
        Project teaser video
      </Label>
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/webm"
        className="sr-only"
        onChange={(event) => void upload(event.target.files?.[0])}
      />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="glass gold-hairline shrink-0 text-cream"
        >
          {uploading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Upload className="mr-2 h-4 w-4" />
          )}
          {uploading ? `Uploading ${progress}%` : value ? "Replace video" : "Upload video"}
        </Button>
        <Input
          type="url"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Or paste a direct MP4/WebM URL"
          aria-label="Project video URL"
          disabled={uploading}
        />
        {value ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Remove project video"
            disabled={uploading}
            onClick={() => onChange("")}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        ) : null}
      </div>
      {uploading ? (
        <div
          className="h-1.5 overflow-hidden rounded-full bg-white/10"
          role="progressbar"
          aria-label="Video upload progress"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full bg-gold transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      ) : null}
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Film className="h-3.5 w-3.5" /> MP4 or WebM · any duration · up to 100 MB · the map preview
        plays the first 10 seconds
      </p>
    </div>
  );
}
