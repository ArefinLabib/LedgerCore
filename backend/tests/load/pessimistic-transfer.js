import autocannon from "autocannon";

const result = await autocannon({
    url: "http://localhost:3000/api/transactions/transfer",
    connections: 50,
    duration: 10,
    method: "POST",

    headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${process.env.TEST_TOKEN}`
    },

    body: JSON.stringify({
        fromAccountId: "9a1a6eef-7413-4ccc-af18-f6c9c3926110",
        toAccountId: "182a6ae2-23ae-4441-bc8e-35f3c92e5c48",
        amount: 1
    })
});

console.log(autocannon.printResult(result));
