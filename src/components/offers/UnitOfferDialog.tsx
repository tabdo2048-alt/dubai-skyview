import { useEffect, useMemo, useState } from "react";
import { Check, FileDown, Loader2, Ruler, Wallet } from "lucide-react";
import { toast } from "sonner";
import type { ProjectWithRelations } from "@/lib/types";
import { fetchProjectById } from "@/hooks/use-projects";
import { areaLabel, displayUnitTypes, pricedUnitTypes, type DisplayUnitType, unitDetailSlug } from "@/lib/unit-types";
import { preparePdfImage, projectMainImage, projectOfferImage, unitFloorPlanImage, unitPhotoImage } from "@/lib/pdf-media";
import { DEFAULT_OFFER_ACCENT_COLOR, DEFAULT_OFFER_PRIMARY_COLOR, safeOfferColor } from "@/lib/offer-branding";
import { safeHttpUrl } from "@/lib/utils";
import { displayPaymentPlans, type DisplayPaymentPlan } from "@/lib/payment-plans";
import { whatsappUrl, CONTACT_WHATSAPP } from "@/lib/contact";
import {
  calculatePaymentPlan,
  formatCurrency,
  formatPercentage,
  type OfferCalculation,
} from "@/lib/offer-calculations";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function UnitOfferDialog({
  project,
  initialUnitId,
  open,
  onOpenChange,
}: {
  project: ProjectWithRelations;
  initialUnitId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [offerProject, setOfferProject] = useState(project);
  const [loadingProject, setLoadingProject] = useState(false);
  const units = useMemo(() => pricedUnitTypes(displayUnitTypes(offerProject.unit_types, offerProject.starting_price_aed)), [offerProject]);
  const plans = useMemo(() => displayPaymentPlans(offerProject.payment_plans, offerProject.payment_plan), [offerProject]);
  const [selectedUnitId, setSelectedUnitId] = useState(units[0]?.id ?? "");
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    let active = true;
    setOfferProject(project);
    if (!open) {
      setLoadingProject(false);
      return () => {
        active = false;
      };
    }

    setLoadingProject(true);
    void fetchProjectById(project.id)
      .then((fullProject) => {
        if (active && fullProject) setOfferProject(fullProject);
      })
      .catch((error) => {
        console.warn("[SalesOffer] Could not refresh project media", error);
      })
      .finally(() => {
        if (active) setLoadingProject(false);
      });

    return () => {
      active = false;
    };
  }, [open, project]);

  useEffect(() => {
    setSelectedUnitId(units.find((unit) => unit.id === initialUnitId)?.id ?? units[0]?.id ?? "");
  }, [initialUnitId, offerProject.id, units]);

  useEffect(() => {
    const defaultPlan = plans.find((plan) => plan.is_default) ?? plans[0];
    setSelectedPlanId(defaultPlan?.id ?? "");
  }, [offerProject.id, plans]);

  const selectedUnit = units.find((unit) => unit.id === selectedUnitId) ?? null;
  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) ?? null;
  const calculation = useMemo<OfferCalculation | null>(() => {
    if (!selectedUnit || !selectedPlan || selectedUnit.price_aed == null) return null;
    return calculatePaymentPlan(selectedUnit.price_aed, selectedPlan, offerProject.fees);
  }, [offerProject.fees, selectedPlan, selectedUnit]);
  const headerPreviewImage = projectOfferImage(offerProject);
  const primaryPreviewColor = safeOfferColor(offerProject.offer_primary_color, DEFAULT_OFFER_PRIMARY_COLOR);
  const accentPreviewColor = safeOfferColor(offerProject.offer_accent_color, DEFAULT_OFFER_ACCENT_COLOR);
  const canGenerate = Boolean(!loadingProject && calculation?.installments.length && calculation.validation.valid);

  async function generateOffer() {
    if (loadingProject) {
      toast.error("Project details are still loading");
      return;
    }
    if (!selectedUnit || !selectedPlan || !calculation) {
      toast.error("Select a unit and payment plan first");
      return;
    }
    if (!calculation.installments.length) {
      toast.error("This payment plan has no saved installments");
      return;
    }
    if (!calculation.validation.valid) {
      toast.error("This payment plan must total 100% before generating an offer");
      return;
    }

    setGenerating(true);
    // Open the tab while the browser still considers this code part of the
    // button click. Navigating it after the async PDF work avoids popup
    // blockers that would reject a late window.open().
    const previewWindow = window.open("about:blank", "_blank");
    if (previewWindow) {
      previewWindow.opener = null;
      previewWindow.document.title = "Preparing sales offer PDF…";
    }
    try {
      const [{ pdf }, { UnitSalesOfferPdf }, QRCode] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/pdf/UnitSalesOfferPdf"),
        import("qrcode"),
      ]);
      const offerId = createOfferId(offerProject.slug, selectedUnit);
      const offerDate = formatDate(new Date());
      const validUntilDate = new Date();
      validUntilDate.setDate(validUntilDate.getDate() + 7);
      const validUntil = formatDate(validUntilDate);
      const baseUrl = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.trim() ||
        (import.meta.env.VITE_APP_URL as string | undefined)?.trim() ||
        window.location.origin;
      const unitPath = unitDetailSlug({
        projectName: offerProject.name,
        projectSlug: offerProject.slug,
        developerName: offerProject.developer?.name,
        developerSlug: offerProject.developer?.slug,
        unitLabel: selectedUnit.label,
      });
      const shareUrl = `${baseUrl.replace(/\/$/, "")}/projects/${encodeURIComponent(offerProject.slug)}/units/${encodeURIComponent(unitPath)}?offer=${encodeURIComponent(offerId)}`;
      // VITE_OFFER_QR_URL can point the PDF QR to any URL. Keep the WhatsApp
      // contact link as the fallback for existing environments.
      const configuredQrUrl = (import.meta.env.VITE_OFFER_QR_URL as string | undefined)?.trim();
      const qrTarget = configuredQrUrl || whatsappUrl(offerProject.name);
      const qrCodeDataUrl = qrTarget
        ? await QRCode.toDataURL(qrTarget, { errorCorrectionLevel: "M", margin: 1, width: 256 })
        : undefined;
      const [projectImageSrc, projectMainImageSrc, unitPhotoImageSrc, unitPlanImageSrc, developerLogoSrc] = await Promise.all([
        preparePdfImage(projectOfferImage(offerProject)),
        preparePdfImage(projectMainImage(offerProject)),
        preparePdfImage(unitPhotoImage(selectedUnit)),
        preparePdfImage(unitFloorPlanImage(selectedUnit)),
        preparePdfImage(safeHttpUrl(offerProject.developer?.logo_url)),
      ]);
      const blob = await pdf(
        <UnitSalesOfferPdf
          project={offerProject}
          unit={selectedUnit}
          plan={selectedPlan}
          calculation={calculation}
          offerId={offerId}
          offerDate={offerDate}
          validUntil={validUntil}
          qrCodeDataUrl={qrCodeDataUrl}
          whatsappNumber={CONTACT_WHATSAPP ?? undefined}
          shareUrl={shareUrl}
          projectImageSrc={projectImageSrc || undefined}
          projectMainImageSrc={projectMainImageSrc || undefined}
          unitPhotoImageSrc={unitPhotoImageSrc || undefined}
          unitPlanImageSrc={unitPlanImageSrc || undefined}
          developerLogoSrc={developerLogoSrc || undefined}
        />,
      ).toBlob();
      const url = URL.createObjectURL(blob);
      if (!previewWindow) {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${safeFileName(offerProject.name)}-${safeFileName(selectedUnit.label)}-${offerId}.pdf`;
        anchor.click();
        toast.success("Popup was blocked, so the sales offer PDF was downloaded");
      } else {
        previewWindow.location.href = url;
        // Keep the object URL alive while the new browser tab loads the PDF.
        // The built-in PDF viewer still exposes its normal Download action.
        window.setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
        toast.success("Sales offer PDF opened in a new tab");
      }
    } catch (error) {
      previewWindow?.close();
      console.error("[SalesOffer] PDF generation failed", error);
      toast.error(error instanceof Error ? error.message : "Could not generate the sales offer PDF");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto border-gold/30 bg-background/95 text-cream backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-cream">Create sales offer</DialogTitle>
          <DialogDescription className="text-muted-foreground">Choose the unit type and a saved payment plan. All PDF stages and amounts come from that plan’s configured installments.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
          <div className="space-y-4">
            <SelectionGroup title="1. Select unit type" icon={<Ruler className="h-4 w-4 text-gold" />}>
              {units.length === 0 ? (
                <EmptyState>There are no priced unit types available for this project.</EmptyState>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                  {units.map((unit) => (
                    <ChoiceButton key={unit.id} selected={unit.id === selectedUnitId} onClick={() => setSelectedUnitId(unit.id)}>
                      <span className="min-w-0 text-left"><span className="block font-medium text-cream">{unit.label}</span>{areaLabel(unit) && <span className="block text-xs text-muted-foreground">{areaLabel(unit)}</span>}</span>
                      <span className="shrink-0 text-sm text-gold-gradient">{formatCurrency(unit.price_aed)}</span>
                    </ChoiceButton>
                  ))}
                </div>
              )}
            </SelectionGroup>

            <SelectionGroup title="2. Select payment plan" icon={<Wallet className="h-4 w-4 text-gold" />}>
              {plans.length === 0 ? (
                <EmptyState>No payment plan has been configured for this project.</EmptyState>
              ) : (
                <div className="space-y-2">
                  {plans.map((plan) => {
                    const planTotal = plan.installments.reduce((sum, installment) => sum + Number(installment.percentage), 0);
                    const valid = plan.installments.length > 0 && Math.abs(planTotal - 100) <= 0.0001;
                    return (
                      <ChoiceButton key={plan.id} selected={plan.id === selectedPlanId} onClick={() => setSelectedPlanId(plan.id)}>
                        <span className="min-w-0 text-left"><span className="flex items-center gap-2 font-medium text-cream">{plan.label}{plan.is_default && <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-gold">Default</span>}</span><span className={`block text-xs ${valid ? "text-emerald-400" : "text-amber-300"}`}>{plan.installments.length ? `Configured total: ${formatPercentage(planTotal)}` : "No installments saved"}</span></span>
                        {plan.id === selectedPlanId && <Check className="h-5 w-5 shrink-0 text-gold" />}
                      </ChoiceButton>
                    );
                  })}
                </div>
              )}
            </SelectionGroup>
          </div>

          <div className="glass-strong gold-hairline rounded-2xl p-4">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Live preview</div>
            {!loadingProject && (
              <div className="mt-3 overflow-hidden rounded-xl border border-gold/20 bg-black/20">
                <div className="relative h-36 overflow-hidden" style={{ backgroundColor: primaryPreviewColor }}>
                  {headerPreviewImage ? (
                    <img src={headerPreviewImage} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full" style={{ backgroundColor: primaryPreviewColor }} />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/35 to-black/10" />
                  <div className="absolute inset-x-4 bottom-3">
                    <div className="text-[10px] uppercase tracking-[0.22em]" style={{ color: accentPreviewColor }}>Sales offer</div>
                    <div className="font-display text-xl text-white">{offerProject.name}</div>
                    <div className="text-[10px] text-white/75">PDF header preview</div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 p-3 text-xs">
                  <span className="text-muted-foreground">{offerProject.offer_header_image_url ? "Selected project image" : "Project main image"} is used in the header</span>
                  <span className="flex items-center gap-2 text-muted-foreground">
                    Brand
                    <span className="h-4 w-4 rounded-full border border-white/20" style={{ backgroundColor: primaryPreviewColor }} title={primaryPreviewColor} />
                    <span className="h-4 w-4 rounded-full border border-white/20" style={{ backgroundColor: accentPreviewColor }} title={accentPreviewColor} />
                  </span>
                </div>
              </div>
            )}
            {loadingProject && <div className="mt-3 rounded-xl border border-gold/20 bg-gold/5 p-3 text-sm text-gold">Loading the original project images and saved payment plans…</div>}
            {selectedUnit && <SelectedUnitPreview unit={selectedUnit} projectName={offerProject.name} price={formatCurrency(selectedUnit.price_aed)} />}
            {!selectedPlan ? (
              <EmptyState>Select a saved payment plan to preview its installments.</EmptyState>
            ) : !calculation?.installments.length ? (
              <div className="mt-5 rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-200">This plan has no saved installments. Add them once in the project admin before generating a PDF.</div>
            ) : (
              <>
                <div className="mt-5 flex items-center justify-between gap-3 border-b border-border/60 pb-2"><div className="text-sm font-medium text-cream">{selectedPlan.label}</div><div className={calculation.validation.valid ? "text-xs text-emerald-400" : "text-xs text-amber-300"}>Plan total: {formatPercentage(calculation.totalPercentage)}</div></div>
                <div className="mt-2 space-y-2">
                  {calculation.installments.map((installment) => (
                    <div className="rounded-xl bg-black/15 p-3" key={installment.id}><div className="flex items-center justify-between gap-3"><span className="font-medium text-cream">{installment.label}</span><span className="text-gold">{formatPercentage(installment.percentage)}</span></div><div className="mt-1 flex items-center justify-between gap-3 text-sm text-muted-foreground"><span>{installment.due_label ?? installment.due_type ?? ""}{installment.months ? ` · ${installment.months} months` : ""}</span><span>{formatCurrency(installment.amount)}</span></div>{installment.monthlyAmount != null && <div className="mt-1 text-xs text-teal">{formatCurrency(installment.monthlyAmount)} / month</div>}</div>
                  ))}
                </div>
                <div className="mt-4 rounded-xl bg-navy/40 p-3"><div className="flex justify-between gap-3 text-sm text-muted-foreground"><span>Configured fees</span><span>{formatCurrency(calculation.financialSummary.totalFees)}</span></div><div className="mt-2 flex justify-between gap-3 border-t border-border/60 pt-2 font-medium text-cream"><span>Total investment</span><span className="text-gold-gradient">{formatCurrency(calculation.financialSummary.totalInvestment)}</span></div></div>
              </>
            )}
            <Button type="button" disabled={!canGenerate || generating} onClick={() => void generateOffer()} className="mt-5 w-full bg-gold text-gold-foreground hover:bg-gold/90">
              {generating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Preparing PDF…</> : <><FileDown className="mr-2 h-4 w-4" /> Open PDF preview</>}
            </Button>
            <p className="mt-2 text-center text-xs text-muted-foreground">The PDF opens in a new browser tab. Use the browser PDF viewer&apos;s download button to save it.</p>
            {selectedPlan && !canGenerate && <p className="mt-2 text-center text-xs text-muted-foreground">Generation requires at least one saved installment and a total of exactly 100%.</p>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SelectionGroup({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <section><div className="mb-2 flex items-center gap-2 text-sm font-medium text-cream">{icon}{title}</div>{children}</section>;
}

function SelectedUnitPreview({ unit, projectName, price }: { unit: DisplayUnitType; projectName: string; price: string }) {
  const photo = unitPhotoImage(unit);
  const floorPlan = unitFloorPlanImage(unit);

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-gold/20 bg-black/15">
      <div className="grid grid-cols-2 gap-2 p-2">
        {photo ? (
          <div className="overflow-hidden rounded-lg border border-white/10 bg-black/20">
            <img src={photo} alt={`${unit.label} unit`} className="h-20 w-full object-cover" loading="lazy" decoding="async" />
            <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">Unit photo</div>
          </div>
        ) : (
          <div className="grid min-h-20 place-items-center rounded-lg border border-dashed border-white/10 px-2 text-center text-[10px] text-muted-foreground">No unit photo uploaded</div>
        )}
        {floorPlan ? (
          <div className="overflow-hidden rounded-lg border border-white/10 bg-white">
            <img src={floorPlan} alt={`${unit.label} floor plan`} className="h-20 w-full bg-white object-contain" loading="lazy" decoding="async" />
            <div className="bg-black/5 px-2 py-1 text-[10px] uppercase tracking-wider text-slate-500">Floor plan</div>
          </div>
        ) : (
          <div className="grid min-h-20 place-items-center rounded-lg border border-dashed border-white/10 px-2 text-center text-[10px] text-muted-foreground">No floor plan selected</div>
        )}
      </div>
      <div className="flex items-end justify-between gap-3 border-t border-border/50 px-3 py-2">
        <div className="min-w-0">
          <div className="font-display text-xl text-cream">{unit.label}</div>
          <div className="text-sm text-muted-foreground">{projectName}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Original unit price</div>
          <div className="text-lg text-gold-gradient">{price}</div>
        </div>
      </div>
    </div>
  );
}

function ChoiceButton({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" role="radio" aria-checked={selected} onClick={onClick} className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition ${selected ? "border-gold bg-gold/10 ring-1 ring-gold/40" : "border-border/60 bg-black/10 hover:border-gold/50"}`}>{children}</button>;
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-border/60 p-3 text-sm text-muted-foreground">{children}</div>;
}

function createOfferId(projectSlug: string, unit: DisplayUnitType): string {
  const projectCode = projectSlug.toUpperCase().replace(/[^A-Z0-9]+/g, "-").slice(0, 12) || "PROJECT";
  const unitCode = unit.label.toUpperCase().replace(/[^A-Z0-9]+/g, "-").slice(0, 10) || "UNIT";
  const random = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `SO-${projectCode}-${unitCode}-${random}`;
}

function safeFileName(value: string): string {
  return value.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 55) || "sales-offer";
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(value);
}
