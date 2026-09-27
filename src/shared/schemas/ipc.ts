import { connectionsSchema, sourceIdSchema } from "../analysis/connections";
import { z } from "zod";
import { grokStatusSchema } from "../analysis/grok";
import { poolSnapshotSchema } from "../analysis/pool-snapshot";
import {
  workspaceConfigSchema,
  workspaceStateSchema,
  workspaceReportSchema,
  researchSchema,
} from "../analysis/workspace";
import { gmgnTargetSchema, gmgnHistorySchema } from "../analysis/gmgn";
import { moniHandleSchema, moniHistorySchema } from "../analysis/moni";
import { prospectsInputSchema } from "../analysis/prospects";
import {
  reportSchema,
  reviewSchema,
  scanRequestSchema,
  settingsSchema,
} from "./domain";
export const commands = {
  sourceConnections: { input: z.undefined(), output: connectionsSchema },
  sourceLogin: { input: sourceIdSchema, output: z.boolean() },
  grokRun: { input: gmgnTargetSchema, output: workspaceReportSchema },
  grokStatus: { input: z.undefined(), output: grokStatusSchema },
  grokCancel: { input: z.undefined(), output: z.boolean() },
  workspaceSources: {
    input: gmgnTargetSchema,
    output: z.object({
      gmgn: z.boolean(),
      x: z.boolean(),
      moni: z.boolean(),
      grok: z.boolean(),
    }),
  },

  poolsLatest: {
    input: gmgnTargetSchema,
    output: poolSnapshotSchema.nullable(),
  },
  poolsRefresh: { input: gmgnTargetSchema, output: poolSnapshotSchema },
  workspaceList: {
    input: z.undefined(),
    output: z.array(workspaceStateSchema).max(20),
  },
  workspaceDelete: { input: gmgnTargetSchema, output: z.boolean() },
  workspaceSave: {
    input: workspaceConfigSchema,
    output: workspaceReportSchema,
  },
  workspaceReport: { input: gmgnTargetSchema, output: workspaceReportSchema },
  workspaceRefresh: {
    input: z
      .object({
        target: gmgnTargetSchema,
        navigate: z.boolean(),
        scope: z.enum(["all", "numeric"]).optional(),
      })
      .strict(),
    output: workspaceReportSchema,
  },
  workspaceOpen: {
    input: z
      .object({
        target: gmgnTargetSchema,
        source: z.enum(["gmgn", "x", "moni", "grok"]),
      })
      .strict(),
    output: z.boolean(),
  },
  workspaceResearch: {
    input: researchSchema.omit({ savedAt: true }),
    output: workspaceReportSchema,
  },
  gmgnOpen: { input: gmgnTargetSchema, output: z.boolean() },
  gmgnCapture: { input: gmgnTargetSchema, output: gmgnHistorySchema },
  gmgnHistory: { input: gmgnTargetSchema, output: gmgnHistorySchema },
  moniOpen: { input: moniHandleSchema, output: z.boolean() },
  moniCapture: { input: moniHandleSchema, output: moniHistorySchema },
  moniHistory: { input: moniHandleSchema, output: moniHistorySchema },
  saveProspects: {
    input: z
      .object({ reportId: z.string(), input: prospectsInputSchema })
      .strict(),
    output: reportSchema,
  },
  credentialStatus: {
    input: z.undefined(),
    output: z.object({
      rpcConfigured: z.boolean(),
      rugcheckConfigured: z.boolean(),
      xConfigured: z.boolean(),
      gmgnConfigured: z.boolean(),
      bubblemapsConfigured: z.boolean(),
      error: z.boolean(),
    }),
  },
  importCredentials: {
    input: z.undefined(),
    output: z.object({
      rpcConfigured: z.boolean(),
      rugcheckConfigured: z.boolean(),
      xConfigured: z.boolean(),
      gmgnConfigured: z.boolean(),
      bubblemapsConfigured: z.boolean(),
      error: z.boolean(),
    }),
  },
  clearCredentials: {
    input: z.undefined(),
    output: z.object({
      rpcConfigured: z.boolean(),
      rugcheckConfigured: z.boolean(),
      xConfigured: z.boolean(),
      gmgnConfigured: z.boolean(),
      bubblemapsConfigured: z.boolean(),
      error: z.boolean(),
    }),
  },
  scan: { input: scanRequestSchema, output: reportSchema },
  reports: { input: z.undefined(), output: z.array(reportSchema) },
  settings: { input: z.undefined(), output: settingsSchema },
  saveSettings: { input: settingsSchema, output: settingsSchema },
  settingsHistory: {
    input: z.undefined(),
    output: z.array(
      z.object({
        id: z.string(),
        beforeJson: z.string(),
        afterJson: z.string(),
        createdAt: z.coerce.date(),
      }),
    ),
  },
  review: { input: reviewSchema, output: reportSchema },
  exportData: { input: z.undefined(), output: z.boolean() },
  deleteData: { input: z.literal("DELETE_LOCAL_DATA"), output: z.boolean() },
  openExternal: {
    input: z
      .string()
      .url()
      .max(2048)
      .refine((s) => {
        try {
          const u = new URL(s);
          return u.protocol === "https:" && !u.username && !u.password;
        } catch {
          return false;
        }
      }, "Разрешены только HTTPS-ссылки без учётных данных."),
    output: z.boolean(),
  },
};
export type Command = keyof typeof commands;
export type Api = {
  [K in Command]: (
    input: z.input<(typeof commands)[K]["input"]>,
  ) => Promise<z.output<(typeof commands)[K]["output"]>>;
};
