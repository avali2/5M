//+------------------------------------------------------------------+
//| 5M-Bridge.mq5 · puente entre MT5 y el bot 5M                     |
//+------------------------------------------------------------------+
#property copyright "5M"
#property version   "1.00"
#property strict

input string BridgeUrl   = "https://five-millions-5m-free.onrender.com";
input string BridgeToken = "PEGA_AQUI_TU_TOKEN";
input int    PollSeconds = 2;
input string Symbols     = "EURUSD,GBPUSD,XAUUSD,USDJPY,USDCAD";
input int    Magic       = 500500;

string UrlEncode(string value)
{
   StringReplace(value, " ", "%20");
   return value;
}

void Ack(string id, string result)
{
   string url = BridgeUrl + "/api/mt5/bridge/ack?id=" + UrlEncode(id) + "&result=" + UrlEncode(result) + "&token=" + UrlEncode(BridgeToken);
   char data[]; char resultData[]; string headers;
   WebRequest("POST", url, "Content-Type: text/plain\r\n", 5000, data, resultData, headers);
}

void CloseSymbol(string symbol)
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      if(!PositionSelectByTicket(PositionGetTicket(i))) continue;
      if(PositionGetString(POSITION_SYMBOL) != symbol) continue;
      MqlTradeRequest request; MqlTradeResult response;
      ZeroMemory(request); ZeroMemory(response);
      request.action = TRADE_ACTION_DEAL;
      request.position = PositionGetInteger(POSITION_TICKET);
      request.symbol = symbol;
      request.volume = PositionGetDouble(POSITION_VOLUME);
      request.type = (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY) ? ORDER_TYPE_SELL : ORDER_TYPE_BUY;
      request.price = (request.type == ORDER_TYPE_SELL) ? SymbolInfoDouble(symbol, SYMBOL_BID) : SymbolInfoDouble(symbol, SYMBOL_ASK);
      request.deviation = 20;
      request.magic = Magic;
      OrderSend(request, response);
   }
}

void ExecuteCommand(string line)
{
   string parts[];
   int count = StringSplit(line, '|', parts);
   if(count < 8) return;
   string id = parts[0];
   string action = parts[1];
   string symbol = parts[2];
   string side = parts[3];
   double volume = StringToDouble(parts[4]);
   double sl = StringToDouble(parts[5]);
   double tp = StringToDouble(parts[6]);
   if(action == "NOOP") { Ack(id, "ok"); return; }
   if(action == "CLOSE") { CloseSymbol(symbol); Ack(id, "ok"); return; }
   if(action == "BUY" || action == "SELL" || side == "BUY" || side == "SELL")
   {
      MqlTradeRequest request; MqlTradeResult response;
      ZeroMemory(request); ZeroMemory(response);
      request.action = TRADE_ACTION_DEAL;
      request.symbol = symbol;
      request.volume = volume > 0 ? volume : 0.01;
      request.type = (action == "BUY" || side == "BUY") ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
      request.price = (request.type == ORDER_TYPE_BUY) ? SymbolInfoDouble(symbol, SYMBOL_ASK) : SymbolInfoDouble(symbol, SYMBOL_BID);
      request.sl = sl; request.tp = tp;
      request.deviation = 20; request.magic = Magic;
      request.comment = "5M-bridge";
      if(OrderSend(request, response)) Ack(id, "ok");
      else Ack(id, "error:" + IntegerToString(response.retcode));
   }
}

void PollCommands()
{
   string url = BridgeUrl + "/api/mt5/bridge/commands?token=" + UrlEncode(BridgeToken);
   char data[]; char result[]; string headers;
   int status = WebRequest("GET", url, "", 5000, data, result, headers);
   if(status != 200) return;
   string text = CharArrayToString(result);
   if(StringLen(text) < 2) return;
   string lines[];
   int total = StringSplit(text, 10, lines);
   for(int i = 0; i < total; i++)
   {
      StringTrimLeft(lines[i]); StringTrimRight(lines[i]);
      if(StringLen(lines[i]) > 3) ExecuteCommand(lines[i]);
   }
}

void SendState()
{
   string body = "";
   body += "account|" + AccountInfoString(ACCOUNT_COMPANY) + "|" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + "|";
   body += DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2) + "|" + DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 2) + "|";
   body += IntegerToString(AccountInfoInteger(ACCOUNT_LEVERAGE)) + "|" + AccountInfoString(ACCOUNT_CURRENCY) + "\n";
   for(int i = 0; i < PositionsTotal(); i++)
   {
      if(!PositionSelectByTicket(PositionGetTicket(i))) continue;
      body += "position|" + IntegerToString(PositionGetInteger(POSITION_TICKET)) + "|" + PositionGetString(POSITION_SYMBOL) + "|";
      body += IntegerToString(PositionGetInteger(POSITION_TYPE)) + "|" + DoubleToString(PositionGetDouble(POSITION_VOLUME), 2) + "|";
      body += DoubleToString(PositionGetDouble(POSITION_PRICE_OPEN), 5) + "|" + DoubleToString(PositionGetDouble(POSITION_SL), 5) + "|";
      body += DoubleToString(PositionGetDouble(POSITION_TP), 5) + "|" + DoubleToString(PositionGetDouble(POSITION_PROFIT), 2) + "\n";
   }
   string symbols[];
   int count = StringSplit(Symbols, ',', symbols);
   for(int i = 0; i < count; i++)
   {
      string symbol = symbols[i];
      StringTrimLeft(symbol); StringTrimRight(symbol);
      string clean = symbol;
      if(SymbolSelect(clean, true))
         body += "quote|" + clean + "|" + DoubleToString(SymbolInfoDouble(clean, SYMBOL_BID), 5) + "|" + DoubleToString(SymbolInfoDouble(clean, SYMBOL_ASK), 5) + "\n";
   }
   string url = BridgeUrl + "/api/mt5/bridge/state?token=" + UrlEncode(BridgeToken);
   char data[]; StringToCharArray(body, data, 0, StringLen(body));
   char result[]; string headers;
   WebRequest("POST", url, "Content-Type: text/plain\r\n", 5000, data, result, headers);
}

int OnInit()
{
   EventSetTimer(PollSeconds);
   Print("5M Bridge iniciado · ", BridgeUrl);
   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason) { EventKillTimer(); }

void OnTimer()
{
   PollCommands();
   SendState();
}
