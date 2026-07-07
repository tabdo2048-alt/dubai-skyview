import { motion, AnimatePresence } from "framer-motion";
import { X, MapPin, Bed, Calendar, Wallet, Building2, ArrowRight, MessageCircle, CalendarCheck } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { ProjectWithRelations } from "@/lib/types";
import { formatAed } from "@/lib/dubai";
import { Button } from "@/components/ui/button";

export function ProjectPopup({ project, onClose }: { project: ProjectWithRelations | null; onClose: () => void }) {
  return (
    <AnimatePresence>
      {project && (
        <motion.div
          key={project.id}
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 260, damping: 26 }}
          className="pointer-events-auto absolute bottom-6 left-1/2 z-30 w-[min(560px,calc(100vw-2rem))] -translate-x-1/2"
        >
          <div className="glass-strong overflow-hidden rounded-3xl">
            <div className="relative h-48 w-full overflow-hidden">
              {project.main_image_url ? (
                <img src={project.main_image_url} alt={project.name} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-muted" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/20 to-transparent" />
              <button
                onClick={onClose}
                aria-label="Close"
                className="glass absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full text-cream hover:text-gold"
              >
                <X className="h-4 w-4" />
              </button>
              {project.featured && (
                <span className="glass gold-hairline absolute left-3 top-3 rounded-full px-3 py-1 text-xs uppercase tracking-widest text-gold">
                  Featured
                </span>
              )}
            </div>

            <div className="space-y-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
                    <Building2 className="h-3.5 w-3.5" />
                    <span className="truncate">{project.developer?.name ?? "Independent"}</span>
                  </div>
                  <h3 className="font-display text-2xl leading-tight text-cream">{project.name}</h3>
                  <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    <span className="truncate">{project.community?.name ?? project.address ?? "Dubai"}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">Starting</div>
                  <div className="text-gold-gradient font-display text-xl">{formatAed(project.starting_price_aed)}</div>
                </div>
              </div>

              {project.description && (
                <p className="line-clamp-2 text-sm text-muted-foreground">{project.description}</p>
              )}

              <div className="grid grid-cols-3 gap-2 text-xs">
                <Stat icon={<Bed className="h-3.5 w-3.5" />} label="Bedrooms" value={bedroomsLabel(project)} />
                <Stat icon={<Calendar className="h-3.5 w-3.5" />} label="Handover" value={project.completion_date ?? "TBA"} />
                <Stat icon={<Wallet className="h-3.5 w-3.5" />} label="Payment" value={project.payment_plan ?? "Flexible"} />
              </div>

              {project.amenities && project.amenities.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {project.amenities.slice(0, 5).map((a) => (
                    <span key={a.id} className="glass rounded-full px-2.5 py-1 text-xs text-cream/90">
                      {a.name}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <Button asChild size="sm" className="bg-gold text-gold-foreground hover:bg-gold/90">
                  <Link to="/projects/$slug" params={{ slug: project.slug }}>
                    View details <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="glass gold-hairline text-cream">
                  <a href={`https://wa.me/971500000000?text=${encodeURIComponent(`Interested in ${project.name}`)}`} target="_blank" rel="noreferrer">
                    <MessageCircle className="mr-1 h-3.5 w-3.5" /> WhatsApp
                  </a>
                </Button>
                <Button asChild size="sm" variant="outline" className="glass gold-hairline text-cream">
                  <a href={`mailto:sales@example.ae?subject=${encodeURIComponent(`Book viewing: ${project.name}`)}`}>
                    <CalendarCheck className="mr-1 h-3.5 w-3.5" /> Book viewing
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function bedroomsLabel(p: ProjectWithRelations) {
  const a = p.bedrooms_min, b = p.bedrooms_max;
  if (a == null && b == null) return "—";
  if (a === b || b == null) return String(a);
  if (a == null) return String(b);
  return `${a}–${b}`;
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="glass rounded-xl p-2.5">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-0.5 truncate text-sm text-cream">{value}</div>
    </div>
  );
}
