import express from "express";
import { benchmarkController } from "../controller/benchmark.controller.js";
import { createAuthMiddleware } from 'authentication';

const router = express.Router();
const authenticateToken = createAuthMiddleware();

router.get("/run-transfer", authenticateToken, benchmarkController.runTransferBenchmark);

export default router;
