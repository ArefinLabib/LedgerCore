import { benchmarkService } from "../services/benchmark.service.js";

export const benchmarkController = {
  async runTransferBenchmark(req, res) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const strategy = req.query.strategy || "serializable";
    const connections = parseInt(req.query.connections, 10) || 50; 
    const duration = parseInt(req.query.duration, 10) || 10;
    const scenario = req.query.scenario || "hot-wallet";

    const sendEvent = (event, data) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const instance = await benchmarkService.runTransferBenchmark(
      { strategy, connections, duration, scenario },
      {
        onInfo: (data) => sendEvent("info", data),
        onStart: (data) => sendEvent("start", data),
        onTick: (data) => sendEvent("tick", data),
        onDone: (data) => {
          sendEvent("done", data);
          res.end();
        },
        onError: (data) => {
          sendEvent("error", data);
          res.end();
        },
      }
    );

    req.on("close", () => {
      res.end();
    });
  },
};
