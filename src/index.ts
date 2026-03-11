import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import dotenv from 'dotenv';

import { MarketDataEngine } from './modules/marketData.js';
import { SignalGenerator } from './modules/signalGenerator.js';
import { OptionsAnalyzer } from './modules/optionsAnalyzer.js';
import { PortfolioManager } from './modules/portfolioManager.js';

dotenv.config();

const marketData = new MarketDataEngine();
const signalGen = new SignalGenerator();
const optionsAnalyzer = new OptionsAnalyzer();
const portfolioManager = new PortfolioManager();

const server = new Server(
  {
    name: "indiaquant-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * Helper to wrap tool results in the expected format
 */
const formatResult = (data: any) => ({
  content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_live_price",
        description: "Fetch live NSE/BSE stock price and change%",
        inputSchema: {
          type: "object",
          properties: {
            symbol: { type: "string", description: "Stock symbol (e.g., RELIANCE, TCS)" },
          },
          required: ["symbol"],
        },
      },
      {
        name: "get_options_chain",
        description: "Pull live options chain data for a symbol",
        inputSchema: {
          type: "object",
          properties: {
            symbol: { type: "string", description: "Stock symbol" },
            expiry: { type: "string", description: "Expiry date (YYYY-MM-DD)" },
          },
          required: ["symbol"],
        },
      },
      {
        name: "analyze_sentiment",
        description: "Analyze news sentiment for a symbol",
        inputSchema: {
          type: "object",
          properties: {
            symbol: { type: "string" },
          },
          required: ["symbol"],
        },
      },
      {
        name: "generate_signal",
        description: "Generate BUY/SELL signal based on technicals + sentiment",
        inputSchema: {
          type: "object",
          properties: {
            symbol: { type: "string" },
            timeframe: { type: "string", description: "Timeframe (e.g., 1d, 1h, 5m)", default: "1d" },
          },
          required: ["symbol"],
        },
      },
      {
        name: "get_portfolio_pnl",
        description: "Show live virtual portfolio P&L",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "place_virtual_trade",
        description: "Place a virtual trade (BUY/SELL)",
        inputSchema: {
          type: "object",
          properties: {
            symbol: { type: "string" },
            qty: { type: "number" },
            side: { type: "string", enum: ["BUY", "SELL"] },
            stopLoss: { type: "number", description: "Stop loss price" },
            target: { type: "number", description: "Target price" },
          },
          required: ["symbol", "qty", "side"],
        },
      },
      {
        name: "calculate_greeks",
        description: "Calculate Black-Scholes Greeks for an option contract",
        inputSchema: {
          type: "object",
          properties: {
            symbol: { type: "string" },
            strike: { type: "number" },
            type: { type: "string", enum: ["call", "put"] },
            expiry: { type: "string" },
          },
          required: ["symbol", "strike", "type", "expiry"],
        },
      },
      {
        name: "detect_unusual_activity",
        description: "Detect unusual options activity (Volume vs OI)",
        inputSchema: {
          type: "object",
          properties: {
            symbol: { type: "string" },
          },
          required: ["symbol"],
        },
      },
      {
        name: "scan_market",
        description: "Scan market for oversold/overbought stocks",
        inputSchema: {
          type: "object",
          properties: {
            rsiBelow: { type: "number" },
            rsiAbove: { type: "number" },
          },
        },
      },
      {
        name: "get_sector_heatmap",
        description: "Get performance heatmap of major sectors",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "get_macro_indicators",
        description: "Fetch macroeconomic indicators (Inflation, Real GDP) from Alpha Vantage",
        inputSchema: { type: "object", properties: {} },
      },
    ],
  };
})

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "get_live_price":
        return formatResult(await marketData.getLivePrice(args?.symbol as string));
      case "get_options_chain":
        return formatResult(await optionsAnalyzer.getOptionsChain(args?.symbol as string, args?.expiry as string));
      case "analyze_sentiment":
        return formatResult(await signalGen.analyzeSentiment(args?.symbol as string));
      case "generate_signal":
        return formatResult(await signalGen.generateSignal(args?.symbol as string, args?.timeframe as string));
      case "get_portfolio_pnl":
        return formatResult(await portfolioManager.getPortfolioPnL());
      case "place_virtual_trade":
        return formatResult(await portfolioManager.placeTrade(
          args?.symbol as string,
          args?.qty as number,
          args?.side as 'BUY' | 'SELL',
          args?.stopLoss as number,
          args?.target as number
        ));
      case "calculate_greeks":
        return formatResult(await optionsAnalyzer.calculateGreeks(args?.symbol as string, args?.strike as number, args?.type as 'call' | 'put', args?.expiry as string));
      case "detect_unusual_activity":
        return formatResult(await optionsAnalyzer.detectUnusualActivity(args?.symbol as string));
      case "scan_market":
        return formatResult(await marketData.scanMarket({ rsiBelow: args?.rsiBelow as number, rsiAbove: args?.rsiAbove as number }));
      case "get_sector_heatmap":
        return formatResult(await marketData.getSectorHeatmap());
      case "get_macro_indicators":
        return formatResult(await marketData.getMacroIndicators());
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      isError: true,
      content: [{ type: "text", text: `Error: ${error.message}` }],
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("IndiaQuant MCP server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
