import { z } from "zod";
import {
  Bounds,
  BoundsSchema,
  CanvasElement,
  CanvasSnapshot,
  boundsForElements,
  boundsIntersect,
  elementBounds,
  projectCanvasSnapshot
} from "./canvas.js";

export const CanvasRegionSchema = z
  .object({
    id: z.string().min(1),
    bounds: BoundsSchema,
    elementIds: z.array(z.string().min(1)),
    score: z.number().finite(),
    source: z.enum(["group", "element", "selection", "spatial"])
  })
  .strict();
export type CanvasRegion = z.infer<typeof CanvasRegionSchema>;

export const RegionSelectionOptionsSchema = z
  .object({
    query: z.string().optional(),
    bounds: BoundsSchema.optional(),
    selectedElementIds: z.array(z.string().min(1)).optional(),
    maxRegions: z.number().int().positive().default(12),
    maxElements: z.number().int().positive().optional(),
    padding: z.number().finite().nonnegative().default(0),
    includeDeleted: z.boolean().default(false)
  })
  .strict();
export type RegionSelectionOptions = z.input<typeof RegionSelectionOptionsSchema>;

function queryTokens(query: string | undefined): string[] {
  return query?.toLocaleLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}_-]*/gu) ?? [];
}

function textForElement(element: CanvasElement): string {
  return `${element.text ?? ""} ${element.originalText ?? ""} ${element.type}`.toLocaleLowerCase();
}

function regionScore(elements: CanvasElement[], options: z.infer<typeof RegionSelectionOptionsSchema>): number {
  const selected = new Set(options.selectedElementIds ?? []);
  const query = queryTokens(options.query);
  const selectedScore = elements.reduce((sum, element) => sum + (selected.has(element.id) ? 5 : 0), 0);
  const queryScore = elements.reduce((sum, element) => sum + query.reduce((hits, token) => hits + (textForElement(element).includes(token) ? 4 : 0), 0), 0);
  return selectedScore + queryScore + (selected.size && elements.some((element) => selected.has(element.id)) ? 3 : 0);
}

function regionFromElements(id: string, elements: CanvasElement[], source: CanvasRegion["source"], options: z.infer<typeof RegionSelectionOptionsSchema>): CanvasRegion | null {
  const bounds = boundsForElements(elements);
  if (!bounds || (options.bounds && !boundsIntersect(bounds, options.bounds, options.padding))) return null;
  return CanvasRegionSchema.parse({ id, bounds, elementIds: elements.map((element) => element.id).sort(), score: regionScore(elements, options), source });
}

/** Returns elements intersecting a rectangular viewport/selection. */
export function selectElementsInRegion(
  snapshotInput: CanvasSnapshot,
  bounds: Bounds,
  options: Pick<RegionSelectionOptions, "includeDeleted" | "padding"> = {}
): CanvasElement[] {
  const snapshot = projectCanvasSnapshot(snapshotInput);
  return snapshot.elements.filter((element) => (options.includeDeleted || !element.isDeleted) && boundsIntersect(elementBounds(element), bounds, options.padding ?? 0));
}

/**
 * Selects stable, compact regions. Group membership is preferred, then
 * ungrouped elements become individual regions; ranking is query/selection
 * aware and deterministic for equal scores.
 */
export function selectRegions(snapshotInput: CanvasSnapshot, optionsInput: RegionSelectionOptions = {}): CanvasRegion[] {
  const options = RegionSelectionOptionsSchema.parse(optionsInput);
  const snapshot = projectCanvasSnapshot(snapshotInput);
  const elements = snapshot.elements.filter((element) => options.includeDeleted || !element.isDeleted);
  const grouped = new Map<string, CanvasElement[]>();
  const used = new Set<string>();
  for (const element of elements) {
    for (const groupId of element.groupIds) {
      const group = grouped.get(groupId) ?? [];
      group.push(element);
      grouped.set(groupId, group);
      used.add(element.id);
    }
  }
  const regions: CanvasRegion[] = [];
  for (const [groupId, group] of [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const region = regionFromElements(`group:${groupId}`, group, "group", options);
    if (region) regions.push(region);
  }
  for (const element of elements) {
    if (used.has(element.id)) continue;
    const source: CanvasRegion["source"] = options.selectedElementIds?.includes(element.id) ? "selection" : "element";
    const region = regionFromElements(`element:${element.id}`, [element], source, options);
    if (region) regions.push(region);
  }
  if (!regions.length && elements.length) {
    const region = regionFromElements("spatial:all", elements, "spatial", options);
    if (region) regions.push(region);
  }
  const selected = new Set(options.selectedElementIds ?? []);
  regions.sort((a, b) => {
    const aSelected = a.elementIds.some((id) => selected.has(id));
    const bSelected = b.elementIds.some((id) => selected.has(id));
    return Number(bSelected) - Number(aSelected) || b.score - a.score || a.id.localeCompare(b.id);
  });
  const limited = regions.slice(0, options.maxRegions);
  if (options.maxElements !== undefined) {
    let remaining = options.maxElements;
    return limited.flatMap((region) => {
      if (remaining <= 0) return [];
      const ids = region.elementIds.slice(0, remaining);
      remaining -= ids.length;
      return [{ ...region, elementIds: ids }];
    });
  }
  return limited;
}

export function selectRelevantElements(snapshot: CanvasSnapshot, options: RegionSelectionOptions = {}): CanvasElement[] {
  const regions = selectRegions(snapshot, options);
  const ids = new Set(regions.flatMap((region) => region.elementIds));
  return projectCanvasSnapshot(snapshot).elements.filter((element) => ids.has(element.id));
}

export const selectRelevantRegions = selectRegions;
export const selectCanvasRegions = selectRegions;
export const selectRegion = selectRegions;
