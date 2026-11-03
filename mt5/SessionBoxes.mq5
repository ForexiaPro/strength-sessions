//+------------------------------------------------------------------+
//| SessionBoxes.mq5                                                 |
//| Draws the Sydney, Tokyo, London and New York sessions as boxes   |
//| from each session's high to its low, in the broker's server time.|
//|                                                                  |
//| Each session is set in its own city's hours, so daylight saving  |
//| is handled per city: London and New York change on different     |
//| dates, Sydney changes the other way, Tokyo never. The broker's   |
//| own offset from UTC is worked out (Auto), or follows the usual   |
//| "New York close" server clock (UTC+2, UTC+3 in US summer), or is |
//| fixed by hand.                                                   |
//|                                                                  |
//| MIT licence. https://github.com/ForexiaPro/strength-sessions        |
//+------------------------------------------------------------------+
#property copyright "Forexia, MIT licence"
#property link      "https://forexiapro.com/forex-sessions/?via=strength-sessions"
#property version   "1.00"
#property description "Forex session boxes (Sydney, Tokyo, London, New York) in their own time zones,"
#property description "daylight saving per city, aligned to your broker's server time."
#property indicator_chart_window
#property indicator_buffers 0
#property indicator_plots   0

enum ENUM_SERVER_CLOCK
  {
   CLOCK_AUTO = 0,     // Auto: the server's offset from UTC now
   CLOCK_NY_CLOSE = 1, // New York close: UTC+2, UTC+3 in US summer
   CLOCK_FIXED = 2     // Fixed: the offset below
  };

input ENUM_SERVER_CLOCK ServerClock = CLOCK_NY_CLOSE; // Broker server clock
input double FixedOffsetHours = 2.0;                  // Fixed offset from UTC (hours)
input int    DaysBack        = 10;                    // Days to draw
input ENUM_TIMEFRAMES MaxTimeframe = PERIOD_H1;       // Hide on timeframes above
input bool   ShowLabels      = true;                  // Session names
input bool   FillBoxes       = true;                  // Filled boxes
input bool   ShowSydney      = true;                  // Sydney
input int    SydneyOpen      = 7;                     // Sydney opens (local hour)
input int    SydneyClose     = 16;                    // Sydney closes (local hour)
input color  SydneyColor     = C'70,55,20';           // Sydney colour
input bool   ShowTokyo       = true;                  // Tokyo
input int    TokyoOpen       = 9;                     // Tokyo opens (local hour)
input int    TokyoClose      = 18;                    // Tokyo closes (local hour)
input color  TokyoColor      = C'75,30,35';           // Tokyo colour
input bool   ShowLondon      = true;                  // London
input int    LondonOpen      = 8;                     // London opens (local hour)
input int    LondonClose     = 17;                    // London closes (local hour)
input color  LondonColor     = C'30,40,90';           // London colour
input bool   ShowNewYork     = true;                  // New York
input int    NewYorkOpen     = 8;                     // New York opens (local hour)
input int    NewYorkClose    = 17;                    // New York closes (local hour)
input color  NewYorkColor    = C'20,70,55';           // New York colour

#define PREFIX "FXSB_"
#define ZONE_SYDNEY 0
#define ZONE_TOKYO  1
#define ZONE_LONDON 2
#define ZONE_NY     3

string   g_names[4] = {"Sydney", "Tokyo", "London", "New York"};
int      g_autoOffset = 0;
datetime g_lastBar = 0;

//--- the date of the n-th Sunday of a month (n = 1..4), or the last (n = 0), at 00:00 UTC
datetime SundayOf(int year, int month, int n)
  {
   MqlDateTime m;
   ZeroMemory(m);
   m.year = year;
   m.mon = month;
   m.day = 1;
   datetime first = StructToTime(m);
   TimeToStruct(first, m);
   int firstSunday = 1 + (7 - m.day_of_week) % 7;
   if(n > 0)
      return first + (datetime)((firstSunday - 1 + 7 * (n - 1)) * 86400);
   int days = 31;
   if(month == 4 || month == 6 || month == 9 || month == 11) days = 30;
   if(month == 2) days = ((year % 4 == 0 && year % 100 != 0) || year % 400 == 0) ? 29 : 28;
   int last = firstSunday;
   while(last + 7 <= days) last += 7;
   return first + (datetime)((last - 1) * 86400);
  }

//--- summer time, as UTC instants
bool UsDst(datetime utc)
  {
   MqlDateTime m;
   TimeToStruct(utc, m);
   datetime start = SundayOf(m.year, 3, 2) + 7 * 3600;  // 2nd Sunday of March, 02:00 EST
   datetime end   = SundayOf(m.year, 11, 1) + 6 * 3600; // 1st Sunday of November, 02:00 EDT
   return utc >= start && utc < end;
  }

bool EuDst(datetime utc)
  {
   MqlDateTime m;
   TimeToStruct(utc, m);
   datetime start = SundayOf(m.year, 3, 0) + 3600;  // last Sunday of March, 01:00 UTC
   datetime end   = SundayOf(m.year, 10, 0) + 3600; // last Sunday of October, 01:00 UTC
   return utc >= start && utc < end;
  }

bool SydneyDst(datetime utc)
  {
   MqlDateTime m;
   TimeToStruct(utc, m);
   datetime end   = SundayOf(m.year, 4, 1) - 8 * 3600;  // 1st Sunday of April, 03:00 AEDT
   datetime start = SundayOf(m.year, 10, 1) - 8 * 3600; // 1st Sunday of October, 02:00 AEST
   return utc < end || utc >= start;
  }

//--- seconds a zone is ahead of UTC at an instant
int ZoneOffset(int zone, datetime utc)
  {
   switch(zone)
     {
      case ZONE_SYDNEY: return 36000 + (SydneyDst(utc) ? 3600 : 0);
      case ZONE_TOKYO:  return 32400;
      case ZONE_LONDON: return EuDst(utc) ? 3600 : 0;
      default:          return -18000 + (UsDst(utc) ? 3600 : 0);
     }
  }

//--- seconds the broker's server clock is ahead of UTC at an instant
int ServerOffset(datetime utc)
  {
   if(ServerClock == CLOCK_FIXED) return (int)MathRound(FixedOffsetHours * 3600);
   if(ServerClock == CLOCK_NY_CLOSE) return 7200 + (UsDst(utc) ? 3600 : 0);
   return g_autoOffset;
  }

void ReadAutoOffset()
  {
   long diff = (long)TimeTradeServer() - (long)TimeGMT();
   g_autoOffset = (int)(MathRound(diff / 900.0) * 900); // to the quarter hour
  }

//--- the instant (UTC) a local wall-clock time happens in a zone
datetime LocalToUtc(int zone, datetime localMidnight, int hour)
  {
   datetime guess = localMidnight + hour * 3600;
   datetime utc = guess - ZoneOffset(zone, guess);
   return guess - ZoneOffset(zone, utc);
  }

int  OpenOf(int z)  { return z == ZONE_SYDNEY ? SydneyOpen : z == ZONE_TOKYO ? TokyoOpen : z == ZONE_LONDON ? LondonOpen : NewYorkOpen; }
int  CloseOf(int z) { return z == ZONE_SYDNEY ? SydneyClose : z == ZONE_TOKYO ? TokyoClose : z == ZONE_LONDON ? LondonClose : NewYorkClose; }
bool ShowOf(int z)  { return z == ZONE_SYDNEY ? ShowSydney : z == ZONE_TOKYO ? ShowTokyo : z == ZONE_LONDON ? ShowLondon : ShowNewYork; }
color ColorOf(int z){ return z == ZONE_SYDNEY ? SydneyColor : z == ZONE_TOKYO ? TokyoColor : z == ZONE_LONDON ? LondonColor : NewYorkColor; }

//--- one box: the session's bars from open to close (server time)
void DrawBox(int zone, datetime from, datetime to, string key)
  {
   datetime times[];
   double highs[], lows[];
   datetime last = MathMin(to, TimeCurrent()) - 1;
   if(last <= from) return;
   int n = CopyTime(_Symbol, _Period, from, last, times);
   if(n <= 0) return; // the weekend, a holiday, or no history
   if(CopyHigh(_Symbol, _Period, from, last, highs) != n || CopyLow(_Symbol, _Period, from, last, lows) != n) return;
   double hi = highs[ArrayMaximum(highs)];
   double lo = lows[ArrayMinimum(lows)];
   datetime t1 = times[0];
   datetime t2 = to;

   string box = PREFIX + key;
   if(ObjectFind(0, box) < 0)
     {
      ObjectCreate(0, box, OBJ_RECTANGLE, 0, t1, hi, t2, lo);
      ObjectSetInteger(0, box, OBJPROP_BACK, true);
      ObjectSetInteger(0, box, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, box, OBJPROP_HIDDEN, true);
     }
   ObjectSetInteger(0, box, OBJPROP_TIME, 0, t1);
   ObjectSetDouble(0, box, OBJPROP_PRICE, 0, hi);
   ObjectSetInteger(0, box, OBJPROP_TIME, 1, t2);
   ObjectSetDouble(0, box, OBJPROP_PRICE, 1, lo);
   ObjectSetInteger(0, box, OBJPROP_COLOR, ColorOf(zone));
   ObjectSetInteger(0, box, OBJPROP_FILL, FillBoxes);
   ObjectSetInteger(0, box, OBJPROP_WIDTH, 1);
   ObjectSetString(0, box, OBJPROP_TOOLTIP, g_names[zone] + " session: high " + DoubleToString(hi, _Digits) + ", low " + DoubleToString(lo, _Digits));

   if(!ShowLabels) return;
   string lab = PREFIX + key + "_t";
   if(ObjectFind(0, lab) < 0)
     {
      ObjectCreate(0, lab, OBJ_TEXT, 0, t1, hi);
      ObjectSetInteger(0, lab, OBJPROP_ANCHOR, ANCHOR_LEFT_LOWER);
      ObjectSetInteger(0, lab, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, lab, OBJPROP_HIDDEN, true);
      ObjectSetInteger(0, lab, OBJPROP_FONTSIZE, 8);
     }
   ObjectSetInteger(0, lab, OBJPROP_TIME, 0, t1);
   ObjectSetDouble(0, lab, OBJPROP_PRICE, 0, hi);
   ObjectSetString(0, lab, OBJPROP_TEXT, g_names[zone]);
   ObjectSetInteger(0, lab, OBJPROP_COLOR, clrSilver);
  }

void DrawAll()
  {
   if(PeriodSeconds(_Period) > PeriodSeconds(MaxTimeframe))
     {
      ObjectsDeleteAll(0, PREFIX);
      return;
     }
   if(ServerClock == CLOCK_AUTO) ReadAutoOffset();
   datetime nowUtc = TimeGMT();
   datetime today = nowUtc - nowUtc % 86400;
   for(int d = -1; d <= DaysBack + 1; d++)
     {
      datetime day = today - d * 86400; // a calendar date, read as each city's local date
      MqlDateTime m;
      TimeToStruct(day, m);
      if(m.day_of_week == 0 || m.day_of_week == 6) continue; // no session on a local Saturday or Sunday
      for(int z = 0; z < 4; z++)
        {
         if(!ShowOf(z)) continue;
         datetime openUtc  = LocalToUtc(z, day, OpenOf(z));
         datetime closeUtc = LocalToUtc(z, day, CloseOf(z));
         if(closeUtc <= openUtc) closeUtc += 86400;
         datetime from = openUtc + ServerOffset(openUtc);
         datetime to   = closeUtc + ServerOffset(closeUtc);
         if(from > TimeCurrent()) continue;
         DrawBox(z, from, to, IntegerToString(z) + "_" + TimeToString(day, TIME_DATE));
        }
     }
   ChartRedraw();
  }

int OnInit()
  {
   IndicatorSetString(INDICATOR_SHORTNAME, "Session boxes");
   EventSetTimer(30);
   return INIT_SUCCEEDED;
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
   ObjectsDeleteAll(0, PREFIX);
  }

void OnTimer()
  {
   DrawAll();
  }

int OnCalculate(const int rates_total, const int prev_calculated, const datetime &time[],
                const double &open[], const double &high[], const double &low[], const double &close[],
                const long &tick_volume[], const long &volume[], const int &spread[])
  {
   if(rates_total <= 0) return 0;
   datetime bar = time[rates_total - 1];
   if(prev_calculated == 0 || bar != g_lastBar)
     {
      g_lastBar = bar;
      DrawAll();
     }
   return rates_total;
  }
//+------------------------------------------------------------------+
