// Check Database Connection
(async () => {
    try {
      const connection = await pool.getConnection();
      console.log("✅ Connected to MySQL database");
      connection.release(); // Release connection back to pool
    } catch (error) {
      console.error("❌ Database connection failed:", error);
    }
  })();
  
  app.get("/testing", async function (req, res) {
    res.json({
      message: "working",
    });
  });