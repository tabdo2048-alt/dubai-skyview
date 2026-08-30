import { Document, Image, Page, Text, View } from "@react-pdf/renderer";
import type { ProjectWithRelations } from "@/lib/types";
import type { DisplayPaymentPlan } from "@/lib/payment-plans";
import type { DisplayUnitType } from "@/lib/unit-types";
import { formatCurrency, formatPercentage, type OfferCalculation } from "@/lib/offer-calculations";
import { bedroomsLabel, positiveCount } from "@/lib/dubai";
import { areaLabel } from "@/lib/unit-types";
import { projectMainImage, projectOfferImage, unitFloorPlanImage, unitPhotoImage } from "@/lib/pdf-media";
import { safeOfferColor } from "@/lib/offer-branding";
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
  projectMainImageSrc?: string;
  unitPhotoImageSrc?: string;
  unitPlanImageSrc?: string;
  developerLogoSrc?: string;
};

function LegacyUnitSalesOfferPdf({
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
  projectMainImageSrc,
  unitPlanImageSrc,
  developerLogoSrc,
}: UnitSalesOfferPdfProps) {
  const projectHeroImage = projectImageSrc || projectOfferImage(project);
  const projectDetailImage = projectMainImageSrc || projectMainImage(project);
  const unitPlanImage = unitPlanImageSrc || unitFloorPlanImage(unit);
  const heroImage = projectHeroImage;
  const developerLogo = developerLogoSrc || safeHttpUrl(project.developer?.logo_url);
  const primaryColor = safeOfferColor(project.offer_primary_color, offerColors.navy);
  const accentColor = safeOfferColor(project.offer_accent_color, offerColors.gold);
  const unitArea = areaLabel(unit);
  const summaryCount = calculation.installments.length + 1;
  const summaryCardWidth = summaryCount <= 3 ? "32.2%" : summaryCount === 4 ? "24.2%" : summaryCount === 5 ? "19.3%" : summaryCount === 6 ? "15.9%" : "13.55%";
  const detailRows = [
    ["Project", project.name],
    ["Unit type", unit.label],
    ["Floor", unit.floor],
    ["Size", unitArea],
    ["Bedrooms", bedroomsLabel(project)],
    ["Bathrooms", positiveCount(project.bathrooms)?.toString() ?? null],
    ["Developer", project.developer?.name],
    ["Status", project.status],
    ["Completion", project.completion_date],
  ].filter((row): row is [string, string] => Boolean(row[1]));

  return (
    <Document title={`${project.name} - Sales Offer`} author={project.developer?.name ?? project.name}>
      <Page size="A4" orientation="landscape" style={offerStyles.page} wrap={false}>
        <OfferHeader project={project} heroImage={heroImage} developerLogo={developerLogo} offerId={offerId} offerDate={offerDate} validUntil={validUntil} primaryColor={primaryColor} accentColor={accentColor} />

        <View style={offerStyles.body}>
          <View style={offerStyles.cardRow}>
              <SummaryCard width={summaryCardWidth} label="Selected unit price" primary={formatCurrency(calculation.unitPrice)} secondary={unit.label} primaryColor={primaryColor} accentColor={accentColor} />
            {calculation.installments.map((installment) => (
              <SummaryCard width={summaryCardWidth} key={installment.id} label={installment.label} primary={formatPercentage(installment.percentage)} secondary={formatCurrency(installment.amount)} primaryColor={primaryColor} accentColor={accentColor} />
            ))}
          </View>

          <View style={offerStyles.columns}>
            <View style={offerStyles.leftColumn}>
              <Text style={offerStyles.sectionTitle}>Unit details</Text>
              <View style={[offerStyles.sectionRule, { borderBottomColor: accentColor }]} />
              <View style={offerStyles.detailCard}>
                {projectDetailImage && <Image src={projectDetailImage} style={offerStyles.projectDetailImage} />}
                {projectDetailImage && <Text style={offerStyles.imageCaption}>Project image</Text>}
                {detailRows.map(([label, value]) => (
                  <View style={label === "Floor" ? [offerStyles.detailRow, { backgroundColor: primaryColor, borderRadius: 3, paddingHorizontal: 4 }] : offerStyles.detailRow} key={label}>
                    <Text style={label === "Floor" ? [offerStyles.detailLabel, { color: offerColors.gold }] : offerStyles.detailLabel}>{label}</Text>
                    <Text style={label === "Floor" ? [offerStyles.detailValue, { color: "#ffffff" }] : offerStyles.detailValue}>{value}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={offerStyles.rightColumn}>
              <Text style={offerStyles.sectionTitle}>Project overview</Text>
              <View style={[offerStyles.sectionRule, { borderBottomColor: accentColor }]} />
              <Text style={offerStyles.overview}>{project.description ?? "Project information is available from the selected listing."}</Text>
              <View style={[offerStyles.planHighlight, { backgroundColor: primaryColor }]}>
                <Text style={[offerStyles.planHighlightLabel, { color: accentColor }]}>Selected payment plan</Text>
                <Text style={offerStyles.planHighlightName}>{plan.label}</Text>
                <View style={offerStyles.planHighlightRow}>
                  <Text style={offerStyles.planHighlightMeta}>{calculation.installments.length} configured installments</Text>
                  <Text style={[offerStyles.planHighlightTotal, { color: accentColor }]}>{formatPercentage(calculation.totalPercentage)}</Text>
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
        <Footer project={project} offerId={offerId} accentColor={accentColor} />
      </Page>

      <Page size="A4" orientation="landscape" style={offerStyles.page} wrap>
        <View style={offerStyles.body}>
          <Text style={[offerStyles.eyebrow, { color: accentColor }]}>Payment structure</Text>
          <Text style={[offerStyles.pageHeading, { color: primaryColor }]}>{plan.label}</Text>
          <Text style={offerStyles.pageIntro}>Every row below is an installment saved on the selected payment plan.</Text>

          <Text style={offerStyles.sectionTitle}>Payment plan summary</Text>
          <View style={[offerStyles.sectionRule, { borderBottomColor: accentColor }]} />
          <PaymentTable calculation={calculation} primaryColor={primaryColor} />

          <View style={offerStyles.columnsCompact}>
            <View style={offerStyles.leftColumn}>
              <Text style={offerStyles.sectionTitle}>Payment distribution</Text>
              <View style={[offerStyles.sectionRule, { borderBottomColor: accentColor }]} />
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
              <View style={[offerStyles.sectionRule, { borderBottomColor: accentColor }]} />
              <View style={[offerStyles.timeline, { borderLeftColor: accentColor }]}>
                {calculation.installments.map((installment) => (
                  <View style={offerStyles.timelineItem} key={installment.id}>
                    <View style={[offerStyles.timelineDot, { backgroundColor: primaryColor, borderColor: accentColor }]} />
                    {installment.due_label && <Text style={[offerStyles.timelineDue, { color: accentColor }]}>{installment.due_label}</Text>}
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
              <View style={[offerStyles.sectionRule, { borderBottomColor: accentColor }]} />
              <View style={[offerStyles.financialBox, { backgroundColor: primaryColor }]}>
                <FinancialRow label="Unit price" value={formatCurrency(calculation.financialSummary.unitPrice)} />
                {calculation.financialSummary.feeRows.map((fee) => (
                  <FinancialRow key={fee.id} label={`${fee.label} (${fee.fee_type === "percentage" ? formatPercentage(Number(fee.value)) : "fixed"})`} value={formatCurrency(fee.amount)} />
                ))}
                <View style={offerStyles.financialTotal}>
                  <Text style={[offerStyles.financialTotalLabel, { color: accentColor }]}>Total investment</Text>
                  <Text style={offerStyles.financialTotalValue}>{formatCurrency(calculation.financialSummary.totalInvestment)}</Text>
                </View>
              </View>
            </View>

            {calculation.monthlyInstallments.length > 0 && (
              <View style={offerStyles.rightColumn}>
                <Text style={offerStyles.sectionTitle}>Monthly amounts</Text>
                <View style={[offerStyles.sectionRule, { borderBottomColor: accentColor }]} />
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
            <View style={[offerStyles.contactBox, { backgroundColor: primaryColor }]}>
              <View style={offerStyles.contactCopy}>
                <Text style={[offerStyles.contactTitle, { color: accentColor }]}>Prepared by</Text>
                {project.developer?.name && <Text style={offerStyles.contactName}>{project.developer.name}</Text>}
                {project.developer?.website && <Text style={offerStyles.contactLine}>{project.developer.website}</Text>}
                {whatsappNumber && <Text style={offerStyles.contactLine}>WhatsApp: +{whatsappNumber}</Text>}
                <Text style={offerStyles.contactLine}>Project page: {shareUrl}</Text>
              </View>
              {qrCodeDataUrl && <Image src={qrCodeDataUrl} style={offerStyles.qr} />}
            </View>
          )}
        </View>
        <Footer project={project} offerId={offerId} accentColor={accentColor} />
      </Page>
    </Document>
  );
}

export function UnitSalesOfferPdf(props: UnitSalesOfferPdfProps) {
  return <OnePageSalesOffer {...props} />;
}

function OnePageSalesOffer({
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
  unitPhotoImageSrc,
  unitPlanImageSrc,
  developerLogoSrc,
}: UnitSalesOfferPdfProps) {
  const headerImage = projectImageSrc || projectOfferImage(project);
  const unitPhoto = unitPhotoImageSrc || unitPhotoImage(unit);
  const unitPlanImage = unitPlanImageSrc || unitFloorPlanImage(unit);
  const developerLogo = developerLogoSrc || safeHttpUrl(project.developer?.logo_url);
  const primaryColor = safeOfferColor(project.offer_primary_color, offerColors.navy);
  const accentColor = safeOfferColor(project.offer_accent_color, offerColors.gold);
  const unitArea = areaLabel(unit);
  const summaryCount = calculation.installments.length + 1;
  const summaryCardWidth = `${Math.max(5.2, (100 - (summaryCount - 1) * 0.7) / summaryCount)}%`;
  const detailRows = [
    ["Project", project.name],
    ["Unit type", unit.label],
    ["Floor", unit.floor],
    ["Size", unitArea],
    ["Bedrooms", bedroomsLabel(project)],
    ["Bathrooms", positiveCount(project.bathrooms)?.toString() ?? null],
    ["Developer", project.developer?.name],
    ["Status", project.status],
    ["Completion", project.completion_date],
  ].filter((row): row is [string, string] => Boolean(row[1]));

  return (
    <Document title={`${project.name} - Sales Offer`} author={project.developer?.name ?? project.name}>
      <Page size="A4" orientation="landscape" style={offerStyles.page} wrap={false}>
        <OfferHeader project={project} heroImage={headerImage} developerLogo={developerLogo} offerId={offerId} offerDate={offerDate} validUntil={validUntil} primaryColor={primaryColor} accentColor={accentColor} />

        <View style={offerStyles.oneBody}>
          <View style={offerStyles.cardRow}>
            <CompactSummaryCard width={summaryCardWidth} label="Unit price" primary={formatCurrency(calculation.unitPrice)} secondary={unit.label} primaryColor={primaryColor} accentColor={accentColor} />
            {calculation.installments.map((installment) => (
              <CompactSummaryCard key={installment.id} width={summaryCardWidth} label={installment.label} primary={formatPercentage(installment.percentage)} secondary={formatCurrency(installment.amount)} primaryColor={primaryColor} accentColor={accentColor} />
            ))}
          </View>

          <View style={offerStyles.oneColumns}>
            <View style={offerStyles.oneLeftColumn}>
              <Text style={offerStyles.sectionTitle}>Unit details</Text>
              <View style={[offerStyles.sectionRule, { borderBottomColor: accentColor }]} />
              <View style={offerStyles.oneDetailCard}>
                {detailRows.map(([label, value]) => (
                  <View style={label === "Floor" ? [offerStyles.oneDetailRow, { backgroundColor: primaryColor, borderRadius: 3, paddingHorizontal: 4 }] : offerStyles.oneDetailRow} key={label}>
                    <Text style={label === "Floor" ? [offerStyles.oneDetailLabel, { color: offerColors.gold }] : offerStyles.oneDetailLabel}>{label}</Text>
                    <Text style={label === "Floor" ? [offerStyles.oneDetailValue, { color: "#ffffff" }] : offerStyles.oneDetailValue}>{value}</Text>
                  </View>
                ))}
              </View>
              <Text style={[offerStyles.sectionTitle, offerStyles.oneOverviewTitle]}>Project overview</Text>
              <View style={[offerStyles.sectionRule, { borderBottomColor: accentColor }]} />
              <Text style={offerStyles.oneOverview}>{project.description?.slice(0, 310) || "Project information is available from the selected listing."}</Text>
            </View>

            <View style={offerStyles.oneCenterColumn}>
              <Text style={offerStyles.sectionTitle}>{plan.label}</Text>
              <View style={[offerStyles.sectionRule, { borderBottomColor: accentColor }]} />
              <OnePagePaymentTable calculation={calculation} primaryColor={primaryColor} />
              <Text style={[offerStyles.sectionTitle, offerStyles.oneOverviewTitle]}>Payment distribution</Text>
              <View style={[offerStyles.sectionRule, { borderBottomColor: accentColor }]} />
              <View style={offerStyles.oneDistributionBox}>
                <View style={[offerStyles.oneDistributionBar, { flexDirection: "row", borderRadius: 4, overflow: "hidden" }]}>
                  {calculation.installments.map((installment, index) => (
                    <View key={installment.id} style={[offerStyles.oneDistributionSegment, { width: `${Math.max(0, installment.percentage)}%`, backgroundColor: chartColors[index % chartColors.length] }]} />
                  ))}
                </View>
                <View style={offerStyles.oneLegend}>
                  {calculation.installments.map((installment, index) => (
                    <View style={offerStyles.oneLegendItem} key={installment.id}>
                      <View style={[offerStyles.oneLegendDot, { backgroundColor: chartColors[index % chartColors.length] }]} />
                      <Text style={offerStyles.oneLegendText}>{installment.label} · {formatPercentage(installment.percentage)} · {formatCurrency(installment.amount)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>

            <View style={offerStyles.oneRightColumn}>
              <Text style={offerStyles.sectionTitle}>Payment timeline</Text>
              <View style={[offerStyles.sectionRule, { borderBottomColor: accentColor }]} />
              <View style={[offerStyles.oneTimeline, { borderLeftColor: accentColor }]}>
                {calculation.installments.map((installment) => (
                  <View style={offerStyles.oneTimelineItem} key={installment.id}>
                    <View style={[offerStyles.oneTimelineDot, { backgroundColor: primaryColor, borderColor: accentColor }]} />
                    {installment.due_label && <Text style={[offerStyles.oneTimelineDue, { color: accentColor }]}>{installment.due_label}</Text>}
                    <Text style={offerStyles.oneTimelineLabel}>{installment.label} · {formatPercentage(installment.percentage)}</Text>
                    <Text style={offerStyles.oneTimelineAmount}>{formatCurrency(installment.amount)}</Text>
                  </View>
                ))}
              </View>
              <Text style={[offerStyles.sectionTitle, offerStyles.oneOverviewTitle]}>Financial summary</Text>
              <View style={[offerStyles.sectionRule, { borderBottomColor: accentColor }]} />
              <View style={[offerStyles.oneFinancialBox, { backgroundColor: primaryColor }]}>
                <OnePageFinancialRow label="Unit price" value={formatCurrency(calculation.financialSummary.unitPrice)} />
                {calculation.financialSummary.feeRows.map((fee) => (
                  <OnePageFinancialRow key={fee.id} label={`${fee.label} (${fee.fee_type === "percentage" ? formatPercentage(Number(fee.value)) : "fixed"})`} value={formatCurrency(fee.amount)} />
                ))}
                <View style={[offerStyles.financialTotal, offerStyles.oneFinancialTotal]}>
                  <Text style={[offerStyles.oneFinancialTotalLabel, { color: accentColor }]}>Total investment</Text>
                  <Text style={offerStyles.oneFinancialTotalValue}>{formatCurrency(calculation.financialSummary.totalInvestment)}</Text>
                </View>
              </View>
              {calculation.monthlyInstallments.length > 0 && (
                <>
                  <Text style={[offerStyles.sectionTitle, offerStyles.oneOverviewTitle]}>Monthly amounts</Text>
                  <View style={[offerStyles.sectionRule, { borderBottomColor: accentColor }]} />
                  {calculation.monthlyInstallments.slice(0, 4).map((installment) => (
                    <View style={offerStyles.oneFinancialRow} key={installment.id}>
                      <Text style={offerStyles.oneFinancialLabel}>{installment.label} · {installment.months} months</Text>
                      <Text style={[offerStyles.oneFinancialValue, { color: offerColors.ink }]}>{formatCurrency(installment.monthlyAmount)} / month</Text>
                    </View>
                  ))}
                </>
              )}
            </View>
          </View>

          <View style={offerStyles.oneBottomRow}>
            {unitPhoto && (
              <View style={[offerStyles.oneFloorPlanBlock, { width: unitPlanImage ? "31%" : "62%" }]}>
                <View style={offerStyles.oneUnitPlanHeading}>
                  <Text style={offerStyles.sectionTitle}>Unit photo</Text>
                  <Text style={offerStyles.oneUnitPlanMeta}>{unit.label}</Text>
                </View>
                <Image src={unitPhoto} style={offerStyles.oneUnitPhotoImage} />
              </View>
            )}
            {unitPlanImage && (
              <View style={[offerStyles.oneFloorPlanBlock, { width: unitPhoto ? "31%" : "62%" }]}>
                <View style={offerStyles.oneUnitPlanHeading}>
                  <Text style={offerStyles.sectionTitle}>Unit layout / floor plan</Text>
                  <Text style={offerStyles.oneUnitPlanMeta}>{unit.label}</Text>
                </View>
                <Image src={unitPlanImage} style={offerStyles.oneUnitPlanImage} />
              </View>
            )}
            {(project.developer?.name || project.developer?.website || qrCodeDataUrl) && (
              <View style={[offerStyles.contactBox, offerStyles.oneContactBlock, { backgroundColor: primaryColor, width: unitPhoto || unitPlanImage ? "38%" : "100%" }]}>
                <View style={offerStyles.contactCopy}>
                  <Text style={[offerStyles.contactTitle, { color: accentColor }]}>Prepared by</Text>
                  {project.developer?.name && <Text style={offerStyles.contactName}>{project.developer.name}</Text>}
                  {project.developer?.website && <Text style={offerStyles.contactLine}>{project.developer.website}</Text>}
                  {whatsappNumber && <Text style={offerStyles.contactLine}>WhatsApp: +{whatsappNumber}</Text>}
                  <Text style={offerStyles.contactLine}>Project page: {shareUrl}</Text>
                </View>
                {qrCodeDataUrl && <Image src={qrCodeDataUrl} style={offerStyles.qr} />}
              </View>
            )}
          </View>
        </View>
        <Footer project={project} offerId={offerId} accentColor={accentColor} />
      </Page>
    </Document>
  );
}

function CompactSummaryCard({ width, label, primary, secondary, primaryColor, accentColor }: { width: string; label: string; primary: string; secondary: string; primaryColor: string; accentColor: string }) {
  return (
    <View style={[offerStyles.summaryCard, { width, minHeight: 39, padding: 5, backgroundColor: primaryColor }]}>
      <Text style={[offerStyles.summaryLabel, { fontSize: 5.2 }]}>{label}</Text>
      <Text style={[offerStyles.summaryPercent, { color: accentColor, fontSize: 10 }]}>{primary}</Text>
      <Text style={[offerStyles.summaryAmount, { fontSize: 5.8 }]}>{secondary}</Text>
    </View>
  );
}

function OnePagePaymentTable({ calculation, primaryColor }: { calculation: OfferCalculation; primaryColor: string }) {
  return (
    <View style={offerStyles.oneTable}>
      <View style={[offerStyles.tableHeader, offerStyles.oneTableHeader, { backgroundColor: primaryColor }]}>
        <Text style={[offerStyles.headerText, offerStyles.oneHeaderText, offerStyles.colStage]}>Installment</Text>
        <Text style={[offerStyles.headerText, offerStyles.oneHeaderText, offerStyles.colPercent]}>%</Text>
        <Text style={[offerStyles.headerText, offerStyles.oneHeaderText, offerStyles.colAmount]}>Amount</Text>
        <Text style={[offerStyles.headerText, offerStyles.oneHeaderText, offerStyles.colDue]}>Due / period</Text>
      </View>
      {calculation.installments.map((installment, index) => (
        <View style={[offerStyles.tableRow, offerStyles.oneTableRow]} key={installment.id}>
          <Text style={[offerStyles.cellText, offerStyles.oneCellText, offerStyles.colStage]}>{index + 1}. {installment.label}</Text>
          <Text style={[offerStyles.cellText, offerStyles.oneCellText, offerStyles.colPercent]}>{formatPercentage(installment.percentage)}</Text>
          <Text style={[offerStyles.cellText, offerStyles.oneCellText, offerStyles.colAmount]}>{formatCurrency(installment.amount)}</Text>
          <Text style={[offerStyles.cellText, offerStyles.oneCellText, offerStyles.colDue]}>{installment.due_label ?? installment.due_type ?? ""}</Text>
        </View>
      ))}
      <View style={[offerStyles.tableTotal, offerStyles.oneTableTotal]}>
        <Text style={[offerStyles.cellStrong, offerStyles.oneCellStrong, offerStyles.colStage]}>Total installments</Text>
        <Text style={[offerStyles.cellStrong, offerStyles.oneCellStrong, offerStyles.colPercent]}>{formatPercentage(calculation.totalPercentage)}</Text>
        <Text style={[offerStyles.cellStrong, offerStyles.oneCellStrong, offerStyles.colAmount]}>{formatCurrency(calculation.totalInstallmentAmount)}</Text>
        <Text style={[offerStyles.cellStrong, offerStyles.oneCellStrong, offerStyles.colDue]} />
      </View>
    </View>
  );
}

function OnePageFinancialRow({ label, value }: { label: string; value: string }) {
  return <View style={[offerStyles.financialRow, offerStyles.oneFinancialRow]}><Text style={offerStyles.oneFinancialLabel}>{label}</Text><Text style={offerStyles.oneFinancialValue}>{value}</Text></View>;
}

function OfferHeader({
  project,
  heroImage,
  developerLogo,
  offerId,
  offerDate,
  validUntil,
  primaryColor,
  accentColor,
}: {
  project: ProjectWithRelations;
  heroImage: string;
  developerLogo: string | null;
  offerId: string;
  offerDate: string;
  validUntil: string;
  primaryColor: string;
  accentColor: string;
}) {
  return (
    <View style={[offerStyles.header, { backgroundColor: primaryColor }]}>
      {heroImage && <Image src={heroImage} style={offerStyles.headerImage} />}
      <View style={[offerStyles.headerShade, { backgroundColor: primaryColor }]} />
      <View style={offerStyles.headerContent}>
        {developerLogo && <Image src={developerLogo} style={offerStyles.logo} />}
        {project.developer?.name && <Text style={offerStyles.developer}>{project.developer.name}</Text>}
        <Text style={[offerStyles.eyebrow, { color: offerColors.gold, opacity: 1 }]}>Sales offer</Text>
        <Text style={[offerStyles.title, { color: "#f8fafc", opacity: 1 }]}>INVESTMENT</Text>
        <Text style={[offerStyles.subtitle, { color: offerColors.gold, opacity: 1 }]}>Proposal</Text>
        <Text style={[offerStyles.projectName, { color: offerColors.gold, opacity: 1 }]}>{project.name}</Text>
        {(project.community?.name ?? project.address) && <Text style={offerStyles.location}>{project.community?.name ?? project.address}</Text>}
      </View>
      <View style={[offerStyles.offerMeta, { borderColor: offerColors.gold, backgroundColor: primaryColor }]}>
        <Text style={[offerStyles.metaLabel, { color: offerColors.gold }]}>Offer ID</Text>
        <Text style={offerStyles.metaValue}>{offerId}</Text>
        <Text style={[offerStyles.metaLabel, { color: offerColors.gold }]}>Date</Text>
        <Text style={offerStyles.metaValue}>{offerDate}</Text>
        <Text style={[offerStyles.metaLabel, { color: offerColors.gold }]}>Valid until</Text>
        <Text style={offerStyles.metaValue}>{validUntil}</Text>
      </View>
    </View>
  );
}

function SummaryCard({ width, label, primary, secondary, primaryColor, accentColor }: { width: string; label: string; primary: string; secondary: string; primaryColor: string; accentColor: string }) {
  return (
    <View style={[offerStyles.summaryCard, { width, backgroundColor: primaryColor }]}>
      <Text style={offerStyles.summaryLabel}>{label}</Text>
      <Text style={[offerStyles.summaryPercent, { color: accentColor }]}>{primary}</Text>
      <Text style={offerStyles.summaryAmount}>{secondary}</Text>
    </View>
  );
}

function PaymentTable({ calculation, primaryColor }: { calculation: OfferCalculation; primaryColor: string }) {
  return (
    <View style={offerStyles.table}>
      <View style={[offerStyles.tableHeader, { backgroundColor: primaryColor }]}>
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

function Footer({ project, offerId, accentColor }: { project: ProjectWithRelations; offerId: string; accentColor: string }) {
  return (
    <View style={offerStyles.footer} fixed>
      <Text style={offerStyles.disclaimer}>Disclaimer: This document is generated from current listing data for information purposes. Availability, prices, fees, payment terms, images, and dates are subject to confirmation in the final sale documents.</Text>
      <Text style={[offerStyles.footerBrand, { color: accentColor }]}>{project.developer?.name ?? project.name}{"\n"}{offerId}</Text>
    </View>
  );
}
