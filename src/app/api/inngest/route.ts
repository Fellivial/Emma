import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import {
  scheduledTasks,
  heartbeat,
  connectionHealth,
  emailSequences,
  approvalsExpiry,
  patternDetection,
  memoryPrune,
  reflection,
  documentProcess,
} from "@/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    scheduledTasks,
    heartbeat,
    connectionHealth,
    emailSequences,
    approvalsExpiry,
    patternDetection,
    memoryPrune,
    reflection,
    documentProcess,
  ],
});
