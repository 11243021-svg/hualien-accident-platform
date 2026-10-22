// Supabase 連線設定。anon key 是設計給網頁公開使用的金鑰，資料表已設定「只能讀」(RLS)，不能寫入。
// 絕對不要把 service_role / secret key 放在這裡。
window.HOT_CONFIG = {
  supabaseUrl: "https://hdldqnbvkzhuqelfmsnm.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhkbGRxbmJ2a3podXFlbGZtc25tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExNDM4MTIsImV4cCI6MjEwNjcxOTgxMn0.EnEVskaO59swHcr2OMLr4SOYzMlprDAcjs3hdDoSMF8",
  tables: { tainan: "tainan_traffic_accidents", hualien: "hualien_traffic_accidents", detections: "detection_events" },
  snapshotBucket: "detection-snapshots",
  // AI 轄區分析的 Edge Function 網址代號（Supabase 後台建立時自動取的，跟顯示名稱 ai-analysis 不一樣）
  aiFunction: "smart-endpoint",
};
