import { routeToAgents } from './src/swarm/router';

async function testRouter() {
    try {
        console.log("Testing basic query...");
        const agents1 = await routeToAgents("My stomach hurts and I am bloated after eating.");
        console.log("-> Basic Query Agents:", agents1);

        console.log("\nTesting skin query...");
        const agents2 = await routeToAgents("I have a weird rash on my arm.");
        console.log("-> Skin Query Agents:", agents2);

        console.log("\nTesting general greeting...");
        const agents3 = await routeToAgents("Hello there!");
        console.log("-> Greeting Agents:", agents3);

        console.log("\nTesting complex multi-symptom query...");
        const agents4 = await routeToAgents("I am dizzy, my joints ache, and I haven't slept fully in days.");
        console.log("-> Complex Query Agents:", agents4);
    } catch (e) {
        console.error("Test failed:", e);
    }
}

testRouter();
