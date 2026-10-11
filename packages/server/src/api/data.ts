import {
  ConversationIdSchema, DiaryEntryIdSchema,
  CreateConversationRequestSchema, UpdateConversationRequestSchema, ListConversationsQuerySchema, ListMessagesQuerySchema,
  CreateDiaryEntryRequestSchema, UpdateDiaryEntryRequestSchema, ListDiaryEntriesQuerySchema,
} from "@innercove/core";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { ZodType } from "zod";
import { NotFoundError } from "../chat/ports.js";
import { DatabaseError } from "../store/db.js";
import { ConversationRepository } from "../store/repos/conversations.js";
import { DiaryRepository } from "../store/repos/diary.js";
import { sendError } from "./errors.js";

function parse<T>(schema: ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new DatabaseError("VALIDATION_ERROR", "Invalid request");
  return parsed.data;
}
function handle(reply: FastifyReply, action: () => unknown) {
  try { return action(); } catch (error) {
    if (error instanceof NotFoundError) return sendError(reply, "NOT_FOUND", "Item not found");
    if (error instanceof DatabaseError) return sendError(reply, error.code, error.message);
    throw error;
  }
}
export function dataRoutes(app: FastifyInstance) {
  app.get("/api/conversations", async (request, reply) => handle(reply, () => {
    const query = parse(ListConversationsQuerySchema, request.query);
    const lease = request.databaseLease!;
    return new ConversationRepository(lease).list(lease.userId, query.limit, query.cursor);
  }));
  app.post("/api/conversations", async (request, reply) => handle(reply, () => {
    const lease = request.databaseLease!;
    const result = new ConversationRepository(lease).create(lease.userId, parse(CreateConversationRequestSchema, request.body));
    return reply.code(201).send(result);
  }));
  app.get("/api/conversations/:id", async (request, reply) => handle(reply, () => {
    const lease = request.databaseLease!;
    return new ConversationRepository(lease).get(lease.userId, parse(ConversationIdSchema, (request.params as { id: string }).id));
  }));
  app.patch("/api/conversations/:id", async (request, reply) => handle(reply, () => {
    const lease = request.databaseLease!;
    return new ConversationRepository(lease).update(lease.userId, parse(ConversationIdSchema, (request.params as { id: string }).id), parse(UpdateConversationRequestSchema, request.body));
  }));
  app.delete("/api/conversations/:id", async (request, reply) => handle(reply, () => {
    const lease = request.databaseLease!;
    return new ConversationRepository(lease).delete(lease.userId, parse(ConversationIdSchema, (request.params as { id: string }).id));
  }));
  app.get("/api/conversations/:id/messages", async (request, reply) => handle(reply, () => {
    const lease = request.databaseLease!;
    const query = parse(ListMessagesQuerySchema, request.query);
    return { messages: new ConversationRepository(lease).listMessages(lease.userId, parse(ConversationIdSchema, (request.params as { id: string }).id), query.limit) };
  }));
  app.get("/api/diary", async (request, reply) => handle(reply, () => {
    const lease = request.databaseLease!;
    const query = parse(ListDiaryEntriesQuerySchema, request.query);
    return new DiaryRepository(lease).list(lease.userId, query.limit, query.cursor, query.q);
  }));
  app.post("/api/diary", async (request, reply) => handle(reply, () => {
    const lease = request.databaseLease!;
    const result = new DiaryRepository(lease).create(lease.userId, parse(CreateDiaryEntryRequestSchema, request.body));
    return reply.code(201).send(result);
  }));
  app.get("/api/diary/:id", async (request, reply) => handle(reply, () => {
    const lease = request.databaseLease!;
    return new DiaryRepository(lease).get(lease.userId, parse(DiaryEntryIdSchema, (request.params as { id: string }).id));
  }));
  app.patch("/api/diary/:id", async (request, reply) => handle(reply, () => {
    const lease = request.databaseLease!;
    return new DiaryRepository(lease).update(lease.userId, parse(DiaryEntryIdSchema, (request.params as { id: string }).id), parse(UpdateDiaryEntryRequestSchema, request.body));
  }));
  app.delete("/api/diary/:id", async (request, reply) => handle(reply, () => {
    const lease = request.databaseLease!;
    return new DiaryRepository(lease).delete(lease.userId, parse(DiaryEntryIdSchema, (request.params as { id: string }).id));
  }));
}
