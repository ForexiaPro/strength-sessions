//+------------------------------------------------------------------+
//| CurrencyStrength.mq5                                             |
//| Currency strength of the eight majors from your terminal's own   |
//| symbols, as eight lines from 0 (weakest) to 10 (strongest).      |
//|                                                                  |
//| The method, bar by bar:                                          |
//|  1. each of the 28 crosses of USD EUR GBP JPY CHF CAD AUD NZD:   |
//|     the percent change of its close over Lookback bars;          |
//|  2. the change counts for the base and against the quote;        |
//|  3. each currency's score is the average over its pairs (7);     |
//|  4. the scores are rescaled to 0-10 across the eight: strongest  |
//|     10, weakest 0. All the same: all 5.                          |
//| The pairs are read at the chart bar's time, so every pair is     |
//| measured to the same moment. A pair the broker does not have is  |
//| left out, and the panel says how many were used.                 |
//|                                                                  |
//| MIT licence. https://github.com/ForexiaPro/strength-sessions        |
//+------------------------------------------------------------------+
#property copyright "Forexia, MIT licence"
#property link      "https://forexiapro.com/tradingtools?via=strength-sessions"
#property version   "1.00"
#property description "Currency strength meter for the eight majors, from the 28 crosses on your own terminal."
#property description "0 = weakest, 10 = strongest over the lookback. Works on any timeframe."
#property indicator_separate_window
#property indicator_buffers 8
#property indicator_plots   8
#property indicator_minimum -0.5
#property indicator_maximum 10.5
#property indicator_level1  5.0
#property indicator_levelcolor clrDimGray
#property indicator_levelstyle STYLE_DOT

#property indicator_label1 "USD"
#property indicator_type1  DRAW_LINE
#property indicator_color1 clrLimeGreen
#property indicator_width1 2
#property indicator_label2 "EUR"
#property indicator_type2  DRAW_LINE
#property indicator_color2 clrDodgerBlue
#property indicator_width2 2
#property indicator_label3 "GBP"
#property indicator_type3  DRAW_LINE
#property indicator_color3 clrRed
#property indicator_width3 2
#property indicator_label4 "JPY"
#property indicator_type4  DRAW_LINE
#property indicator_color4 clrGold
#property indicator_width4 2
#property indicator_label5 "CHF"
#property indicator_type5  DRAW_LINE
#property indicator_color5 clrMagenta
#property indicator_width5 2
#property indicator_label6 "CAD"
#property indicator_type6  DRAW_LINE
#property indicator_color6 clrOrange
#property indicator_width6 2
#property indicator_label7 "AUD"
#property indicator_type7  DRAW_LINE
#property indicator_color7 clrAqua
#property indicator_width7 2
#property indicator_label8 "NZD"
#property indicator_type8  DRAW_LINE
#property indicator_color8 clrSilver
#property indicator_width8 2

input int    Lookback   = 24;   // Lookback (bars of the chart's timeframe)
input int    BarsToDraw = 300;  // Bars to draw
input string Prefix     = "";   // Symbol prefix (empty: read from the chart's symbol)
input string Suffix     = "";   // Symbol suffix (empty: read from the chart's symbol)
input bool   ShowPanel  = true; // Ranking panel

#define PREFIX_OBJ "FXCS_"

string g_cur[8] = {"USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD"};
string g_pairs[28] = {"EURUSD", "GBPUSD", "AUDUSD", "NZDUSD", "USDJPY", "USDCHF", "USDCAD",
                      "EURGBP", "EURJPY", "EURCHF", "EURCAD", "EURAUD", "EURNZD",
                      "GBPJPY", "GBPCHF", "GBPCAD", "GBPAUD", "GBPNZD",
                      "AUDJPY", "AUDCHF", "AUDCAD", "AUDNZD",
                      "NZDJPY", "NZDCHF", "NZDCAD",
                      "CADJPY", "CADCHF", "CHFJPY"};
string g_sym[28];    // the broker's name for each pair, or "" if it has none
int    g_base[28], g_quote[28];
int    g_have = 0;
datetime g_lastFull = 0;

double B0[], B1[], B2[], B3[], B4[], B5[], B6[], B7[];

int CurIndex(string c)
  {
   for(int i = 0; i < 8; i++) if(g_cur[i] == c) return i;
   return -1;
  }

//--- the prefix and suffix around a major pair in the chart's symbol: "EURUSD.m" -> "", ".m"
void ReadAffixes(string &pre, string &suf)
  {
   pre = Prefix;
   suf = Suffix;
   if(Prefix != "" || Suffix != "") return;
   string s = _Symbol;
   for(int p = 0; p < 28; p++)
     {
      int at = StringFind(s, g_pairs[p]);
      if(at >= 0)
        {
         pre = StringSubstr(s, 0, at);
         suf = StringSubstr(s, at + 6);
         return;
        }
     }
  }

void SetBuffer(int k, double &buf[])
  {
   SetIndexBuffer(k, buf, INDICATOR_DATA);
   ArraySetAsSeries(buf, false);
   PlotIndexSetDouble(k, PLOT_EMPTY_VALUE, EMPTY_VALUE);
   PlotIndexSetString(k, PLOT_LABEL, g_cur[k]);
  }

int OnInit()
  {
   if(Lookback < 1) return INIT_PARAMETERS_INCORRECT;
   SetBuffer(0, B0); SetBuffer(1, B1); SetBuffer(2, B2); SetBuffer(3, B3);
   SetBuffer(4, B4); SetBuffer(5, B5); SetBuffer(6, B6); SetBuffer(7, B7);
   IndicatorSetString(INDICATOR_SHORTNAME, "Currency strength (" + IntegerToString(Lookback) + " bars)");
   IndicatorSetInteger(INDICATOR_DIGITS, 1);
   string pre, suf;
   ReadAffixes(pre, suf);
   g_have = 0;
   for(int p = 0; p < 28; p++)
     {
      g_base[p] = CurIndex(StringSubstr(g_pairs[p], 0, 3));
      g_quote[p] = CurIndex(StringSubstr(g_pairs[p], 3, 3));
      string name = pre + g_pairs[p] + suf;
      bool custom = false;
      if(SymbolExist(name, custom) && SymbolSelect(name, true)) { g_sym[p] = name; g_have++; }
      else g_sym[p] = "";
     }
   EventSetTimer(60);
   return INIT_SUCCEEDED;
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
   ObjectsDeleteAll(0, PREFIX_OBJ);
  }

// a full redraw each minute, in case another symbol's history has come in
void OnTimer()
  {
   g_lastFull = 0; // the next tick redraws every bar
  }

void Put(int i, int k, double v)
  {
   switch(k)
     {
      case 0: B0[i] = v; break; case 1: B1[i] = v; break; case 2: B2[i] = v; break; case 3: B3[i] = v; break;
      case 4: B4[i] = v; break; case 5: B5[i] = v; break; case 6: B6[i] = v; break; default: B7[i] = v;
     }
  }

//--- one bar: the eight strengths at time t; returns the number of pairs used
int StrengthAt(datetime t, double &out[])
  {
   double sum[8], n[8];
   ArrayInitialize(sum, 0);
   ArrayInitialize(n, 0);
   int used = 0;
   for(int p = 0; p < 28; p++)
     {
      if(g_sym[p] == "") continue;
      int sh = iBarShift(g_sym[p], _Period, t, false);
      if(sh < 0) continue;
      double now = iClose(g_sym[p], _Period, sh);
      double then = iClose(g_sym[p], _Period, sh + Lookback);
      if(now <= 0 || then <= 0) continue;
      double pct = (now / then - 1.0) * 100.0;
      sum[g_base[p]] += pct;  n[g_base[p]] += 1;
      sum[g_quote[p]] -= pct; n[g_quote[p]] += 1;
      used++;
     }
   double lo = DBL_MAX, hi = -DBL_MAX;
   double avg[8];
   for(int c = 0; c < 8; c++)
     {
      avg[c] = n[c] > 0 ? sum[c] / n[c] : EMPTY_VALUE;
      if(n[c] > 0) { lo = MathMin(lo, avg[c]); hi = MathMax(hi, avg[c]); }
     }
   for(int c = 0; c < 8; c++)
     {
      if(n[c] == 0) out[c] = EMPTY_VALUE;
      else out[c] = (hi - lo < 1e-12) ? 5.0 : (avg[c] - lo) / (hi - lo) * 10.0;
     }
   return used;
  }

void Panel(const double &s[], int used)
  {
   if(!ShowPanel) return;
   int win = ChartWindowFind();
   if(win < 0) return;
   int order[8];
   for(int i = 0; i < 8; i++) order[i] = i;
   for(int i = 0; i < 8; i++)
      for(int j = i + 1; j < 8; j++)
         if((s[order[j]] != EMPTY_VALUE ? s[order[j]] : -1) > (s[order[i]] != EMPTY_VALUE ? s[order[i]] : -1))
           { int x = order[i]; order[i] = order[j]; order[j] = x; }
   for(int i = 0; i < 9; i++)
     {
      string name = PREFIX_OBJ + IntegerToString(i);
      if(ObjectFind(0, name) < 0)
        {
         ObjectCreate(0, name, OBJ_LABEL, win, 0, 0);
         ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_RIGHT_UPPER);
         ObjectSetInteger(0, name, OBJPROP_ANCHOR, ANCHOR_RIGHT_UPPER);
         ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
         ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
         ObjectSetInteger(0, name, OBJPROP_FONTSIZE, 8);
         ObjectSetString(0, name, OBJPROP_FONT, "Consolas");
        }
      ObjectSetInteger(0, name, OBJPROP_XDISTANCE, 8);
      ObjectSetInteger(0, name, OBJPROP_YDISTANCE, 4 + i * 13);
      if(i == 8)
        {
         ObjectSetString(0, name, OBJPROP_TEXT, IntegerToString(used) + " of 28 pairs");
         ObjectSetInteger(0, name, OBJPROP_COLOR, clrGray);
         continue;
        }
      int c = order[i];
      string v = s[c] == EMPTY_VALUE ? "  -" : DoubleToString(s[c], 1);
      ObjectSetString(0, name, OBJPROP_TEXT, IntegerToString(i + 1) + " " + g_cur[c] + " " + v);
      color col = (color)PlotIndexGetInteger(c, PLOT_LINE_COLOR);
      ObjectSetInteger(0, name, OBJPROP_COLOR, col);
     }
  }

int OnCalculate(const int rates_total, const int prev_calculated, const datetime &time[],
                const double &open[], const double &high[], const double &low[], const double &close[],
                const long &tick_volume[], const long &volume[], const int &spread[])
  {
   if(rates_total < Lookback + 2) return 0;
   int first = MathMax(Lookback + 1, rates_total - BarsToDraw);
   int start = (prev_calculated == 0 || g_lastFull == 0) ? 0 : MathMax(first, prev_calculated - 1);
   if(start == 0)
     {
      for(int i = 0; i < first; i++) for(int k = 0; k < 8; k++) Put(i, k, EMPTY_VALUE);
      start = first;
      g_lastFull = TimeCurrent();
     }
   double s[8];
   int used = 0;
   for(int i = start; i < rates_total; i++)
     {
      used = StrengthAt(time[i], s);
      for(int k = 0; k < 8; k++) Put(i, k, s[k]);
     }
   Panel(s, used);
   return rates_total;
  }
//+------------------------------------------------------------------+
