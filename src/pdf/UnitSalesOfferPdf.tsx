import { Document, Image, Page, Text, View } from "@react-pdf/renderer";
import type { ProjectWithRelations } from "@/lib/types";
import type { DisplayPaymentPlan } from "@/lib/payment-plans";
import type { DisplayUnitType } from "@/lib/unit-types";
import { formatCurrency, formatPercentage, type OfferCalculation } from "@/lib/offer-calculations";
import { areaLabel } from "@/lib/unit-types";
import { projectOfferImage, unitOfferImage } from "@/lib/pdf-media";
import { safeHttpUrl } from "@/lib/utils";
import { chartColors, offerColors, offerStyles } from "@/pdf/offer-pdf-styles";

export type UnitSalesOfferPdfProps = {
  project: ProjectWithRelations;
  unit: DisplayUnitType;
  plan: DisplayPaymentPlan;
  calculation: OfferCalculation;
  offerId: string;
  offerDate: string;
  validUntil: string;
  qrCodeDataUrl?: string;
  whatsappNumber?: string;
  shareUrl: string;
  projectImageSrc?: string;
  unitPlanImageSrc?: string;
  developerLogoSrc?: string;
};

export function UnitSalesOfferPdf({
  project,
  unit,
  plan,
  calculation,
  offerId,
  offerDate,
  validUntil,
  qrCodeDataUrl,
  whatsappNumber,
  shareUrl,
  projectImageSrc,
  unitPlanImageSrc,
  developerLogoSrc,
}: UnitSalesOfferPdfProps) {
  const projectHeroImage = projectImageSrc || projectOfferImage(project);
  const unitPlanImage = unitPlanImageSrc || unitOfferImage(unit);
  const heroImage = projectHeroImage;
  const developerLogo = developerLogoSrc || safeHttpUrl(project.developer?.logo_url);
  const unitArea = areaLabel(unit);
  const summaryCount = calculation.installments.length + 1;
  const summaryCardWidth = summaryCount <= 3 ? "32.2%" : summaryCount === 4 ? "24.2%" : summaryCount === 5 ? "19.3%" : summaryCount === 6 ? "15.9%" : "13.55%";
  const detailRows = [
    ["Project", project.name],
    ["Unit type", unit.label],
    ["Size", unitArea],
    ["Bedrooms", project.bedrooms_min != null ? `${project.bedrooms_min}${project.bedrooms_max && project.bedrooms_max !== project.bedrooms_min ? `-${project.bedrooms_max}` : ""}` : null],
    ["Bathrooms", project.bathrooms != null && project.bathrooms > 0 ? String(project.bathrooms) : null],
    ["Location", project.community?.name ?? project.address],
    ["Status", project.status],
    ["Completion", project.completion_date],
  ].filter((row): row is [string, string] => Boolean(row[1]));

  return (
    <Document title={`${project.name} - Sales Offer`} author={project.developer?.name ?? project.name}>
      <Page size="A4" orientation="landscape" style={offerStyles.page} wrap={false}>
        <OfferHeader project={project} heroImage={heroImage} developerLogo={developerLogo} offerId={offerId} offerDate={offerDate} validUntil={validUntil} />

        <View style={offerStyles.body}>
          <View style={offerStyles.cardRow}>
            <SummaryCard width={summaryCardWidth} label="Selected unit price" primary={formatCurrency(calculation.unitPrice)} secondary={unit.label} />
            {calculation.installments.map((installment) => (
              <SummaryCard width={summaryCardWidth} key={installment.id} label={installment.label} primary={formatPercentage(installment.percentage)} secondary={formatCurrency(installment.amount)} />
            ))}
          </View>

          <View style={offerStyles.columns}>
            <View style={offerStyles.leftColumn}>
              <Text style={offerStyles.sectionTitle}>Unit details</Text>
              <View style={offerStyles.sectionRule} />
              <View style={offerStyles.detailCard}>
                {projectHeroImage && <Image src={projectHeroImage} style={offerStyles.projectDetailImage} />}
                {projectHeroImage && <Text style={offerStyles.imageCaption}>Project image</Text>}
                {detailRows.map(([label, value]) => (
                  <View style={offerStyles.detailRow} key={label}>
                    <Text style={offerStyles.detailLabel}>{label}</Text>
                    <Text style={offerStyles.detailValue}>{value}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={offerStyles.rightColumn}>
              <Text style={offerStyles.sectionTitle}>Project overview</Text>
              <View style={offerStyles.sectionRule} />
              <Text style={offerStyles.overview}>{project.description ?? "Project information is available from the selected listing."}</Text>
              <View style={offerStyles.planHighlight}>
                <Text style={offerStyles.planHighlightLabel}>Selected payment plan</Text>
                <Text style={offerStyles.planHighlightName}>{plan.label}</Text>
                <View style={offerStyles.planHighlightRow}>
                  <Text style={offerStyles.planHighlightMeta}>{calculation.installments.length} configured installments</Text>
                  <Text style={offerStyles.planHighlightTotal}>{formatPercentage(calculation.totalPercentage)}</Text>
                </View>
              </View>
            </View>
          </View>

          {unitPlanImage && (
            <View style={offerStyles.unitPlanSection}>
              <View style={offerStyles.unitPlanHeading}>
                <Text style={offerStyles.sectionTitle}>Unit layout / floor plan</Text>
                <Text style={offerStyles.unitPlanMeta}>{unit.label}</Text>
              </View>
              <Image src={unitPlanImage} style={offerStyles.unitPlanImage} />
            </View>
          )}
        </View>
        <Footer project={project} offerId={offerId} />
      </Page>

      <Page size="A4" orientation="landscape" style={offerStyles.page} wrap>
        <View style={offerStyles.body}>
          <Text style={offerStyles.eyebrow}>Payment structure</Text>
          <Text style={offerStyles.pageHeading}>{plan.label}</Text>
          <Text style={offerStyles.pageIntro}>Every row below is an installment saved on the selected payment plan.</Text>

          <Text style={offerStyles.sectionTitle}>Payment plan summary</Text>
          <View style={offerStyles.sectionRule} />
          <PaymentTable calculation={calculation} />

          <View style={offerStyles.columnsCompact}>
            <View style={offerStyles.leftColumn}>
              <Text style={offerStyles.sectionTitle}>Payment distribution</Text>
              <View style={offerStyles.sectionRule} />
              <View style={offerStyles.distributionBox}>
                <View style={offerStyles.distributionBar}>
                  {calculation.installments.map((installment, index) => (
                    <View key={installment.id} style={[offerStyles.distributionSegment, { width: `${Math.max(0, installment.percentage)}%`, backgroundColor: chartColors[index % chartColors.length] }]} />
                  ))}
                </View>
                <View style={offerStyles.legend}>
                  {calculation.installments.map((installment, index) => (
                    <View style={offerStyles.legendItem} key={installment.id}>
                      <View style={[offerStyles.legendDot, { backgroundColor: chartColors[index % chartColors.length] }]} />
                      <Text style={offerStyles.legendText}>{installment.label} - {formatPercentage(installment.percentage)} - {formatCurrency(installment.amount)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
            <View style={offerStyles.rightColumn}>
              <Text style={offerStyles.sectionTitle}>Payment timeline</Text>
              <View style={offerStyles.sectionRule} />
              <View style={offerStyles.timeline}>
                {calculation.installments.map((installment) => (
                  <View style={offerStyles.timelineItem} key={installment.id}>
                    <View style={offerStyles.timelineDot} />
                    {installment.due_label && <Text style={offerStyles.timelineDue}>{installment.due_label}</Text>}
                    <Text style={offerStyles.timelineLabel}>{installment.label} - {formatPercentage(installment.percentage)}</Text>
                    <Text style={offerStyles.timelineAmount}>{formatCurrency(installment.amount)}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          <View style={offerStyles.columnsCompact}>
            <View style={offerStyles.leftColumn}>
              <Text style={offerStyles.sectionTitle}>Financial summary</Text>
              <View style={offerStyles.sectionRule} />
              <View style={offerStyles.financialBox}>
                <FinancialRow label="Unit price" value={formatCurrency(calculation.financialSummary.unitPrice)} />
                {calculation.financialSummary.feeRows.map((fee) => (
                  <FinancialRow key={fee.id} label={`${fee.label} (${fee.fee_type === "percentage" ? formatPercentage(Number(fee.value)) : "fixed"})`} value={formatCurrency(fee.amount)} />
                ))}
                <View style={offerStyles.financialTotal}>
                  <Text style={offerStyles.financialTotalLabel}>Total investment</Text>
                  <Text style={offerStyles.financialTotalValue}>{formatCurrency(calculation.financialSummary.totalInvestment)}</Text>
                </View>
              </View>
            </View>

            {calculation.monthlyInstallments.length > 0 && (
              <View style={offerStyles.rightColumn}>
                <Text style={offerStyles.sectionTitle}>Monthly amounts</Text>
                <View style={offerStyles.sectionRule} />
                <View style={offerStyles.detailCard}>
                  {calculation.monthlyInstallments.map((installment) => (
                    <View style={offerStyles.detailRow} key={installment.id}>
                      <Text style={offerStyles.detailLabel}>{installment.label} - {installment.months} months</Text>
                      <Text style={offerStyles.detailValue}>{formatCurrency(installment.monthlyAmount)} / month</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>

          {(project.developer?.name || project.developer?.website || qrCodeDataUrl) && (
            <View style={offerStyles.contactBox}>
              <View style={offerStyles.contactCopy}>
                <Text style={offerStyles.contactTitle}>Prepared by</Text>
                {project.developer?.name && <Text style={offerStyles.contactName}>{project.developer.name}</Text>}
                {project.developer?.website && <Text style={offerStyles.contactLine}>{project.developer.website}</Text>}
                {whatsappNumber && <Text style={offerStyles.contactLine}>WhatsApp: +{whatsappNumber}</Text>}
                <Text style={offerStyles.contactLine}>Project page: {shareUrl}</Text>
              </View>
              {qrCodeDataUrl && <Image src={qrCodeDataUrl} style={offerStyles.qr} />}
            </View>
          )}
        </View>
        <Footer project={project} offerId={offerId} />
      </Page>
    </Document>
  );
}

function OfferHeader({
  project,
  heroImage,
  developerLogo,
  offerId,
  offerDate,
  validUntil,
}: {
  project: ProjectWithRelations;
  heroImage: string;
  developerLogo: string | null;
  offerId: string;
  offerDate: string;
  validUntil: string;
}) {
  return (
    <View style={offerStyles.header}>
      {heroImage && <Image src={heroImage} style={offerStyles.headerImage} />}
      <View style={offerStyles.headerShade} />
      <View style={offerStyles.headerContent}>
        {developerLogo && <Image src={developerLogo} style={offerStyles.logo} />}
        {project.developer?.name && <Text style={offerStyles.developer}>{project.developer.name}</Text>}
        <Text style={offerStyles.eyebrow}>Sales offer</Text>
        <Text style={offerStyles.title}>INVESTMENT</Text>
        <Text style={offerStyles.subtitle}>Proposal</Text>
        <Text style={offerStyles.projectName}>{project.name}</Text>
        {(project.community?.name ?? project.address) && <Text style={offerStyles.location}>{project.community?.name ?? project.address}</Text>}
      </View>
      <View style={offerStyles.offerMeta}>
        <Text style={offerStyles.metaLabel}>Offer ID</Text>
        <Text style={offerStyles.metaValue}>{offerId}</Text>
        <Text style={offerStyles.metaLabel}>Date</Text>
        <Text style={offerStyles.metaValue}>{offerDate}</Text>
        <Text style={offerStyles.metaLabel}>Valid until</Text>
        <Text style={offerStyles.metaValue}>{validUntil}</Text>
      </View>
    </View>
  );
}

function SummaryCard({ width, label, primary, secondary }: { width: string; label: string; primary: string; secondary: string }) {
  return (
    <View style={[offerStyles.summaryCard, { width }]}>
      <Text style={offerStyles.summaryLabel}>{label}</Text>
      <Text style={offerStyles.summaryPercent}>{primary}</Text>
      <Text style={offerStyles.summaryAmount}>{secondary}</Text>
    </View>
  );
}

function PaymentTable({ calculation }: { calculation: OfferCalculation }) {
  return (
    <View style={offerStyles.table}>
      <View style={offerStyles.tableHeader}>
        <Text style={[offerStyles.headerText, offerStyles.colStage]}>Installment</Text>
        <Text style={[offerStyles.headerText, offerStyles.colPercent]}>% of price</Text>
        <Text style={[offerStyles.headerText, offerStyles.colAmount]}>Amount</Text>
        <Text style={[offerStyles.headerText, offerStyles.colDue]}>Due / period</Text>
      </View>
      {calculation.installments.map((installment, index) => (
        <View style={offerStyles.tableRow} key={installment.id}>
          <Text style={[offerStyles.cellText, offerStyles.colStage]}>{index + 1}. {installment.label}</Text>
          <Text style={[offerStyles.cellText, offerStyles.colPercent]}>{formatPercentage(installment.percentage)}</Text>
          <Text style={[offerStyles.cellText, offerStyles.colAmount]}>{formatCurrency(installment.amount)}</Text>
          <Text style={[offerStyles.cellText, offerStyles.colDue]}>{installment.due_label ?? installment.due_type ?? ""}</Text>
        </View>
      ))}
      <View style={offerStyles.tableTotal}>
        <Text style={[offerStyles.cellStrong, offerStyles.colStage]}>Total installments</Text>
        <Text style={[offerStyles.cellStrong, offerStyles.colPercent]}>{formatPercentage(calculation.totalPercentage)}</Text>
        <Text style={[offerStyles.cellStrong, offerStyles.colAmount]}>{formatCurrency(calculation.totalInstallmentAmount)}</Text>
        <Text style={[offerStyles.cellStrong, offerStyles.colDue]} />
      </View>
    </View>
  );
}

function FinancialRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={offerStyles.financialRow}>
      <Text style={offerStyles.financialLabel}>{label}</Text>
      <Text style={offerStyles.financialValue}>{value}</Text>
    </View>
  );
}

function Footer({ project, offerId }: { project: ProjectWithRelations; offerId: string }) {
  return (
    <View style={offerStyles.footer} fixed>
      <Text style={offerStyles.disclaimer}>Disclaimer: This document is generated from current listing data for information purposes. Availability, prices, fees, payment terms, images, and dates are subject to confirmation in the final sale documents.</Text>
      <Text style={offerStyles.footerBrand}>{project.developer?.name ?? project.name}{"\n"}{offerId}</Text>
    </View>
  );
}
