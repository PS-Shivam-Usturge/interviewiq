import { DefaultRequestHandler, InMemoryTaskStore } from "@a2a-js/sdk/server";
import { jsonRpcHandler, agentCardHandler, UserBuilder } from "@a2a-js/sdk/server/express";
import { AGENT_CARD_PATH } from "@a2a-js/sdk";
import { buildAgentCard, A2A_PATH, publicBaseUrl } from "./agentCard.js";
import { InterviewAgentExecutor } from "./executor.js";
import logger from "../logger.js";

const log = logger.child({ component: "A2A" });

/**
 * Mount the A2A (Agent-to-Agent, protocol v1.0) interface on the Express app:
 *   GET  /.well-known/agent-card.json  — public discovery card
 *   POST /a2a/jsonrpc                  — JSON-RPC endpoint (SendMessage, GetTask, CancelTask, …)
 * Existing /api routes are untouched; auth + rate limiting middleware apply as usual.
 */
export function mountA2A(app) {
  const card = buildAgentCard();
  const requestHandler = new DefaultRequestHandler(card, new InMemoryTaskStore(), new InterviewAgentExecutor());

  app.use(`/${AGENT_CARD_PATH}`, agentCardHandler({ agentCardProvider: requestHandler }));
  app.use(A2A_PATH, jsonRpcHandler({ requestHandler, userBuilder: UserBuilder.noAuthentication }));

  log.info({ card: `${publicBaseUrl()}/${AGENT_CARD_PATH}`, endpoint: `${publicBaseUrl()}${A2A_PATH}` }, "A2A interface mounted");
}

export { AGENT_CARD_PATH };
