import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { renderToFile } from "@react-pdf/renderer";
import { UnitSalesOfferPdf } from "../src/pdf/UnitSalesOfferPdf";
import { calculatePaymentPlan, validatePaymentPlanTotal } from "../src/lib/offer-calculations";
import { canOfferUnit, findUnitForRoute, type DisplayUnitType } from "../src/lib/unit-types";
import type { ProjectWithRelations } from "../src/lib/types";
import type { DisplayPaymentPlan } from "../src/lib/payment-plans";

const unit: DisplayUnitType = { id: "test-unit", label: "Studio", price_aed: 1000000, area_sqm_min: 75, area_sqm_max: 75, floor: "16", floor_plan_url: null, sort_order: 0, availability: "available", bedrooms: 0, bathrooms: 1, view_description: "Garden" };
assert.equal(canOfferUnit(unit), true);
assert.equal(canOfferUnit({ ...unit, availability: "sold" }), false);
assert.equal(canOfferUnit({ ...unit, price_aed: null }), false);
assert.equal(validatePaymentPlanTotal([{ percentage: -10 }, { percentage: 110 }]).valid, false);
assert.equal(validatePaymentPlanTotal([{ percentage: NaN }, { percentage: 100 }]).valid, false);
const lookup = { name: "Demo", slug: "demo", unit_types: [unit] };
assert.equal(findUnitForRoute(lookup, "test-unit")?.id, unit.id);
assert.equal(findUnitForRoute(lookup, "foreign-unit"), null);
assert.equal(findUnitForRoute({ ...lookup, unit_types: [unit, { ...unit, id: "another" }] }, "demo-studio"), null);

const project = { name: "KEYORA DEMO RESIDENCES", slug: "demo", description: "Illustrative test only. This is not a real sales offer.", developer: { name: "Demo developer" }, community: { name: "Dubai" }, status: "off_plan", completion_date: "Q4 2027", images: [] } as unknown as ProjectWithRelations;
const image = `data:image/png;base64,${(await readFile("public/landmarks/dubai-opera.png")).toString("base64")}`;
await mkdir("artifacts/unit-offer-check", { recursive: true });
for (const count of [4, 24]) {
  const plan = { id: `plan-${count}`, label: "Illustrative payment plan", installments: Array.from({ length: count }, (_, index) => ({ id: `row-${index}`, label: `Installment ${index + 1}`, stage: index ? "construction" : "booking", percentage: 100 / count, due_label: `Month ${index + 1}`, sort_order: index, months: index === 0 ? 10 : null })) } as unknown as DisplayPaymentPlan;
  const calculation = calculatePaymentPlan(unit.price_aed!, { ...plan, installments: [...plan.installments, { ...plan.installments[0], id: "zero", percentage: 0 }] }, [{ id: "fee", label: "DLD", fee_type: "percentage", value: 4, sort_order: 0 }, { id: "zero-fee", label: "Zero fee", fee_type: "fixed", value: 0, sort_order: 1 }]);
  assert.equal(calculation.validation.valid, true);
  assert.equal(calculation.installments.length, count);
  assert.equal(calculation.financialSummary.totalInvestment, 1040000);
  assert.equal(calculation.financialSummary.feeRows.length, 1);
  assert.equal(calculation.installments[0].monthlyAmount, (1000000 * (100 / count) / 100) / 10);
  assert.equal(calculation.installments[1].monthlyAmount, null);
  await renderToFile(<UnitSalesOfferPdf project={project} unit={unit} plan={plan} calculation={calculation} offerId={`DRAFT-TEST-${count}`} offerDate="07 Sep 2026" validUntil="14 Sep 2026" qrCodeDataUrl={image} projectImageSrc={image} unitPhotoImageSrc={image} />, `artifacts/unit-offer-check/offer-${count}.pdf`);
}
console.log("Passed: sold-unit guard, missing price, route ownership, ambiguous labels, invalid plans, zero rows, fee totals and two PDF layouts.");
