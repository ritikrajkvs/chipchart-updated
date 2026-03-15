import fetch from 'node-fetch';

const apiKey = "AIzaSyBHejgtnfuT3VawKBHrMzP2gZOvlvGoZG8";
const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

async function test() {
  try {
    console.log("Fetching accessible models...");
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.models) {
      console.log("Successfully retrieved accessible models:");
      data.models.forEach(model => {
        if (model.supportedGenerationMethods.includes("generateContent")) {
           console.log(`- ${model.name}`);
        }
      });
    } else {
      console.error("Failed or no models found.", data);
    }
  } catch (e) {
    console.error("Fetch failed", e);
  }
}

test();
