import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TourErrorProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}
export function TourError({
  title = "تعذر تحميل المشهد",
  message = "تحقق من الاتصال ثم حاول مرة أخرى.",
  onRetry,
}: TourErrorProps) {
  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-[#080a0d]/90 px-4" role="alert">
      <div className="glass-strong gold-hairline max-w-md rounded-3xl p-8 text-center">
        <AlertTriangle className="mx-auto h-9 w-9 text-gold" aria-hidden="true" />
        <h2 className="mt-4 font-display text-2xl text-cream">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        {onRetry && (
          <Button type="button" onClick={onRetry} className="mt-5 bg-gold text-gold-foreground hover:bg-gold/90">
            <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" /> إعادة المحاولة
          </Button>
        )}
      </div>
    </div>
  );
}
