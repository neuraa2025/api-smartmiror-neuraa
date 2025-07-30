import cors from "cors";

const corsOptions = {
  origin: function (origin: any, callback: any) {
    // Allow all origins including undefined (for mobile apps, dev tools, etc.)
    callback(null, true);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH", "HEAD"],
  allowedHeaders: [
    "Origin",
    "X-Requested-With", 
    "Content-Type",
    "Accept",
    "Authorization",
    "Cache-Control",
    "X-Forwarded-For",
    "X-Forwarded-Proto",
    "X-Forwarded-Host",
    "Access-Control-Allow-Origin",
    "Access-Control-Allow-Methods",
    "Access-Control-Allow-Headers",
    "Access-Control-Allow-Credentials"
  ],
  exposedHeaders: [
    "Access-Control-Allow-Origin",
    "Access-Control-Allow-Methods", 
    "Access-Control-Allow-Headers",
    "Access-Control-Allow-Credentials"
  ],
  optionsSuccessStatus: 200, // Some legacy browsers (IE11, various SmartTVs) choke on 204
  maxAge: 86400, // 24 hours
};

export default cors(corsOptions);
