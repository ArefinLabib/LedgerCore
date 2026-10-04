import autocannon from "autocannon";

const statusCounts = {};
const errorSamples = [];   // collect a few non-2xx response bodies
const MAX_SAMPLES = 5;

const instance = autocannon({
    url: "http://localhost:3000/api/transactions/transfer",
    connections: 50,
    duration: 5,           // shorter run, enough to reproduce
    method: "POST",

    headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${process.env.TEST_TOKEN}`
    },

    body: JSON.stringify({
        fromAccountId: "9a1a6eef-7413-4ccc-af18-f6c9c3926110",
        toAccountId: "182a6ae2-23ae-4441-bc8e-35f3c92e5c48",
        amount: 1
    }),

    setupClient(client) {
        client.on("response", (statusCode, resBytes, responseTime) => {
            // Track every status code
            statusCounts[statusCode] = (statusCounts[statusCode] || 0) + 1;

            // Capture a few non-2xx response bodies
            if (statusCode >= 300 && errorSamples.length < MAX_SAMPLES) {
                errorSamples.push({
                    statusCode,
                    body: resBytes.toString(),
                    responseTime
                });
            }
        });
    }
});

instance.on("done", (result) => {
    console.log(autocannon.printResult(result));

    console.log("\n========= STATUS CODE BREAKDOWN =========");
    for (const [code, count] of Object.entries(statusCounts).sort()) {
        console.log(`  ${code}: ${count} responses`);
    }

    console.log("\n========= ERROR SAMPLES (first 5) =========");
    for (const sample of errorSamples) {
        console.log(`\n  [${sample.statusCode}] (${sample.responseTime}ms)`);
        // Try to pretty-print JSON, fallback to raw
        try {
            console.log("  ", JSON.parse(sample.body));
        } catch {
            console.log("  ", sample.body.slice(0, 500));
        }
    }

    console.log("\n========= SUMMARY =========");
    const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);
    const success = statusCounts[200] || 0;
    const failed = total - success;
    console.log(`  Total: ${total}, Success (200): ${success}, Failed: ${failed}`);

    if (result.errors) console.log(`  Connection errors: ${result.errors}`);
    if (result.timeouts) console.log(`  Timeouts: ${result.timeouts}`);
    if (result.mismatches) console.log(`  Mismatches: ${result.mismatches}`);
    if (result.resets) console.log(`  Resets: ${result.resets}`);
});
