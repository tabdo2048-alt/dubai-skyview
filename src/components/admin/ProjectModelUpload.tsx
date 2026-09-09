import { useRef, useState } from "react";
import { Box, Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createProjectModelUploadSignature } from "@/lib/cloudinary-model.functions";

const MAX_MODEL_BYTES = 100 * 1024 * 1024;

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
    request.onerror = () => reject(new Error("Network error while uploading the 3D model"));
    request.onload = () => {
      const response = request.response as CloudinaryUploadResponse | null;
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(response?.error?.message || "Cloudinary rejected the 3D model"));
        return;
      }
      resolve(response ?? {});
    };
    request.send(body);
  });
}

export function ProjectModelUpload({
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
    if (!file.name.toLowerCase().endsWith(".glb")) {
      onError("Choose a self-contained GLB model");
      return;
    }
    if (file.size > MAX_MODEL_BYTES) {
      onError("The 3D model must be 100 MB or smaller");
      return;
    }

    setUploading(true);
    setProgress(0);
    try {
      const signed = await createProjectModelUploadSignature({ data: { tenantId } });
      const body = new FormData();
      body.append("file", file);
      body.append("api_key", signed.apiKey);
      body.append("timestamp", String(signed.timestamp));
      body.append("signature", signed.signature);
      body.append("folder", signed.folder);
      body.append("public_id", signed.publicId);
      body.append("allowed_formats", signed.allowedFormats);

      const result = await uploadWithProgress(
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(signed.cloudName)}/raw/upload`,
        body,
        setProgress,
      );
      if (!result.secure_url) throw new Error("Cloudinary did not return a model URL");
      onChange(result.secure_url);
      setProgress(100);
    } catch (error) {
      onError(error instanceof Error ? error.message : "3D model upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2 sm:col-span-2">
      <Label className="text-xs uppercase tracking-widest text-muted-foreground">
        Interactive 3D project model
      </Label>
      <input
        ref={inputRef}
        type="file"
        accept=".glb,model/gltf-binary"
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
          {uploading ? `Uploading ${progress}%` : value ? "Replace model" : "Upload GLB"}
        </Button>
        <Input
          type="url"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Paste an HTTPS .glb URL or a 3D Tiles tileset.json URL"
          aria-label="Project 3D model URL"
          disabled={uploading}
        />
        {value ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Remove project 3D model"
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
          aria-label="3D model upload progress"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full bg-gold transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      ) : null}
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Box className="h-3.5 w-3.5" /> Upload GLB with embedded textures (up to 100 MB), or paste a hosted 3D Tiles tileset.json URL
      </p>
    </div>
  );
}
