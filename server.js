require("dotenv").config();
const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const bodyParser = require("body-parser");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const BASE_URL = `https://billing-nku4.onrender.com`;
const BASE_Local = `http://localhost:5000`;
const app = express();
const PORT = process.env.PORT || 5000;

// app.use((req, res, next) => {
//   res.header('Access-Control-Allow-Origin', '*');
//   res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
//   res.header('Access-Control-Allow-Headers', 'Content-Type');
//   next();
// });

// ✅ Ensure 'uploads' folder exists

const uploadDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ✅ Middleware (Fix: Ensure middleware is used)
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// app.use("/Imageuploads", express.static(uploadDir));

app.use("/uploads", express.static("uploads")); // Serve uploaded images

// Database Connection Pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  port: process.env.DB_PORT,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
});

// ✅ Configure multer for image upload (LoginID-based) - FIXED VERSION
const imageStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Use a temporary filename first
    const tempFilename = `temp_${Date.now()}_${file.originalname}`;
    cb(null, tempFilename);
  },
});

// File filter to accept only PNG files
const fileFilter = (req, file, cb) => {
  if (file.mimetype === "image/png") {
    cb(null, true);
  } else {
    cb(new Error("Only PNG files are allowed!"), false);
  }
};

// Create multer upload middleware with configuration
const uploadImage = multer({
  storage: imageStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: fileFilter,
});

// ✅ General multer for other file uploads (if needed)
const generalStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // Unique filename
  },
});

const upload = multer({ storage: generalStorage });

app.post("/upload-image", uploadImage.single("image"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded or invalid file type",
      });
    }

    const loginID = req.body.LoginID;
    if (!loginID) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        message: "LoginID is required",
      });
    }

    // Rename uploaded file to use LoginID as the filename
    const ext = path.extname(req.file.originalname);
    const newFilename = `${loginID}${ext}`;
    const newFilePath = path.join(uploadDir, newFilename);

    fs.renameSync(req.file.path, newFilePath);
    // const fileUrl = `https://cranky-davinci.216-10-253-21.plesk.page/Imageuploads/${newFilename}`;

    const fileUrl = `/uploads/${newFilename}`;
    res.status(200).json({
      success: true,
      message: "Image uploaded successfully",
      data: {
        filename: newFilename,
        originalName: req.file.originalname,
        size: req.file.size,
        url: fileUrl,
        loginID: loginID,
      },
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to upload image",
      error: error.message,
    });
  }
});

// ✅ Get image by loginID
app.get("/get-image/:loginID", (req, res) => {
  const loginID = req.params.loginID;

  // Find matching file with any image extension
  const possibleExts = [".png", ".jpg", ".jpeg", ".webp", ".gif"];
  let foundPath = null;

  for (const ext of possibleExts) {
    const imagePath = path.join(uploadDir, `${loginID}${ext}`);
    if (fs.existsSync(imagePath)) {
      foundPath = imagePath;
      break;
    }
  }

  if (foundPath) {
    res.set({
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    });
    res.sendFile(foundPath);
  } else {
    res.status(404).json({
      success: false,
      message: "Image not found",
    });
  }
});

// ✅ Delete image endpoint
app.delete("/delete-image/:loginID", (req, res) => {
  const loginID = req.params.loginID;
  const imagePath = path.join(uploadDir, `${loginID}.png`);

  if (fs.existsSync(imagePath)) {
    try {
      fs.unlinkSync(imagePath);
      res.json({
        success: true,
        message: "Image deleted successfully",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to delete image",
        error: error.message,
      });
    }
  } else {
    res.status(404).json({
      success: false,
      message: "Image not found",
    });
  }
});

// ✅ Error handling middleware for multer (should be before other routes)
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "File too large. Maximum size is 5MB.",
      });
    }
  }

  if (error.message === "Only PNG files are allowed!") {
    return res.status(400).json({
      success: false,
      message: "Only PNG files are allowed!",
    });
  }

  if (error.message === "LoginID is required") {
    return res.status(400).json({
      success: false,
      message: "LoginID is required",
    });
  }

  res.status(500).json({
    success: false,
    message: "Something went wrong!",
    error: error.message,
  });
});

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

app.get("/test", async function (req, res) {
  res.json({
    message: "working",
  });
});

//save products
app.post("/productSave", upload.single("image"), async (req, res) => {
  let connection;
  try {
    const {
      productName,
      price,
      mrp,
      useDefaultImage,
      defaultImageName,
      FLoginId,
      Barcode,
      Tax,
      Points,
    } = req.body;

    // Validate required fields
    if (!productName || !mrp || !price || !FLoginId) {
      return res.status(400).json({
        success: false,
        message: "Product details are required",
      });
    }

    // Determine image name
    let imageName;
    if (req.file) {
      // User uploaded an image
      imageName = req.file.filename;
      console.log("Using uploaded image:", imageName);
    } else if (useDefaultImage && defaultImageName) {
      // Use specified default image
      imageName = defaultImageName;
      console.log("Using default image:", imageName);
    } else {
      // Fallback default image
      imageName = "no-image-icon-4.png";
      console.log("Using fallback default image:", imageName);
    }

    // Acquire connection from the pool
    connection = await pool.getConnection();

    // Begin transaction
    await connection.beginTransaction();

    // Prepare parameters
    const params = [
      productName,
      parseFloat(mrp),
      parseFloat(price),
      imageName,
      parseInt(FLoginId),
      Barcode && Barcode.trim() !== "" ? Barcode : null,
      Tax,
      Points,
    ];
    console.log("parms", params);
    // Call stored procedure
    const [results] = await connection.query(
      "CALL insertProduct(?, ?, ?, ?, ?, ?, ? ,?)",
      params
    );

    // Commit transaction
    await connection.commit();

    // Advanced result extraction
    let productId = null;
    let insertResult = null;

    // Complex result parsing
    if (Array.isArray(results)) {
      // Handle nested array results
      if (results[0] && Array.isArray(results[0])) {
        insertResult = results[0][0];
      } else {
        insertResult = results[0];
      }
    } else {
      insertResult = results;
    }
    // Comprehensive ID extraction strategy
    const extractProductId = (result) => {
      // Try multiple extraction methods
      const idCandidates = [
        result?.product_id,
        result?.insertId,
        result?.id,
        result && Object.values(result)[0],
      ];

      // Find the first truthy value that is a number
      const extractedId = idCandidates.find(
        (id) => id !== null && id !== undefined && !isNaN(Number(id))
      );

      return extractedId !== undefined ? Number(extractedId) : null;
    };

    // Extract product ID
    productId = extractProductId(insertResult);

    console.log("Extracted Product ID:", productId);

    // Validate result with more robust checking
    if (productId === null || productId === undefined) {
      console.error("Product ID Extraction Failed", {
        insertResult: insertResult,
        resultType: typeof insertResult,
        resultKeys: insertResult ? Object.keys(insertResult) : null,
      });

      throw new Error("Could not retrieve valid product ID from database");
    }

    // Successful response
    res.status(201).json({
      success: true,
      message: insertResult?.message || "Product saved successfully",
      productId: productId,
    });
  } catch (error) {
    console.error("Product Save Error:", error);

    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("Rollback error:", rollbackError);
      }
    }

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Barcode must be unique. This barcode is already in use.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Something went wrong while saving the product.",
      error: error.message,
    });
  } finally {
    if (connection) connection.release();
  }
});
// app.post("/productssave", upload.single("image"), async (req, res) => {
//   try {
//     const { productName, price, mrp, useDefaultImage, defaultImageName ,FLoginId } =
//       req.body;
//     if (!productName || !price || !mrp || !FLoginId) {
//       return res
//         .status(400)
//         .json({ success: false, message: "Product details are required" });
//     }

//     let imageName;

//     // Check if user uploaded an image or we should use default
//     if (req.file) {
//       // User uploaded an image, use that
//       imageName = req.file.filename;
//     } else if (useDefaultImage && defaultImageName) {
//       // No image uploaded, use the default one
//       imageName = defaultImageName;
//     } else {
//       // No image provided and no default specified
//       imageName = "1742551986076.png"; // Fallback default
//     }

//     // Insert Product into MySQL
//     const [result] = await pool.query(
//       'insertProduct(?, ?, ?, ?,?)',
//       [productName, price, mrp, imageName,FLoginId]
//     );

//     res
//       .status(201)
//       .json({
//         success: true,
//         message: "Product saved successfully",
//         productId: result.insertId,
//       });
//   } catch (error) {
//     console.error("❌ Error saving product:", error);
//     res.status(500).json({ success: false, message: "Server error" });
//   }
// });

//Show Procucts
app.get("/showproducts", async (req, res) => {
  try {
    const userId = req.query.userId;
    // Stored procedure call
    let query = "CALL selectProduct(?)";

    let params = [userId || null];

    const [rows] = await pool.query(query, params);

    // Assuming the first result set contains the products
    const products = rows[0].map((product) => ({
      ...product,
      imageUrl: product.ImageName
        ? `${BASE_URL}/uploads/${product.ImageName}`
        : null,
    }));

    res.json(products);
  } catch (error) {
    console.error("❌ Error fetching products:", error);
    res.status(500).json({
      success: false,
      message: "Server error,Try again, Please refresh",
      error: error.message,
    });
  }
});

// app.get("/showproducts", async (req, res) => {
//   try {
//     const userId = req.query.userId;
//     // console.log("User ID:", userId);

//     // Stored procedure call
//     let query = "CALL getBillNumber(?)";
//     let params = [userId || null];

//     const [rows] = await pool.query(query, params);

//     res.json(products);
//   } catch (error) {
//     console.error("❌ Error fetching products:", error);
//     res.status(500).json({
//       success: false,
//       message: "Server error",
//       error: error.message
//     });
//   }
// });
// ✅ Get Products API
// app.get("/showproducts", async (req, res) => {
//   try {
//     const userId = req.query.userId;
//     console.log(userId)
//     let query = "CALL selectProduct(?)";//"SELECT ProductID , ProductName, Price, MRP, ImageName, fLoginID FROM products";
//     let params = [userId || Null];

//     // If userId is provided, add WHERE clause to filter by FLoginId
//     if (userId) {
//       //query += " WHERE fLoginID = ?";
//       params.push(userId);
//     }

//     const [rows] = await pool.query(query, params);
//     console.log("p",rows);

//     // Append image URL to each product
//     const products = rows.map((product) => ({
//       ...product,
//       imageUrl: `http://localhost:${PORT}/uploads/${product.ImageName}`,
//     }));

//     res.json(products);
//   } catch (error) {
//     console.error("❌ Error fetching products:", error);
//     res.status(500).json({ success: false, message: "Server error" });
//   }
// });

// ✅ **Delete Product API**
app.delete("/deleteproduct/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const [results] = await pool.query("CALL deleteProduct(?)", [id]);

    const processDeleteResults = (results) => {
      if (Array.isArray(results) && results[0] && results[0].length > 0) {
        return results[0][0];
      }
      const affectedRows =
        results.affectedRows ||
        (results[0] && results[0].affectedRows) ||
        (results[0] && results[0][0] && results[0][0].affectedRows);
      return { affectedRows };
    };

    const result = processDeleteResults(results);
    const isSuccessful =
      (result && result.status === 1) ||
      (result && result.status === "1") ||
      (result && result.affectedRows > 0);

    if (isSuccessful) {
      res.json({ success: true, message: "Product deleted successfully" });
    } else {
      res.status(404).json({
        success: false,
        message: result ? result.message : "Product not found",
      });
    }
  } catch (error) {
    console.error("❌ Error deleting product:", error);

    if (error.code === "ER_ROW_IS_REFERENCED_2") {
      // Send custom error message for foreign key constraint
      return res.status(409).json({
        success: false,
        message: "This product is used in Sale/Purchase records and cannot be deleted.",
      });
    }

    res
      .status(500)
      .json({ success: false, message: "Server error. Try again later." });
  }
});

// app.delete("/deleteproduct/:id", async (req, res) => {
//   try {
//     const { id } = req.params;
//     await pool.query("DELETE FROM products WHERE ProductID  = ?", [id]);
//     res.json({ success: true, message: "Product deleted successfully" });
//   } catch (error) {
//     console.error("❌ Error deleting product:", error);
//     res.status(500).json({ success: false, message: "Server error" });
//   }
// });

app.put("/product/:id", upload.single("image"), async (req, res) => {
  let connection;

  try {
    const { mrp, price, FLoginId, Barcode, Tax, Points } = req.body;
    const { id } = req.params;

    if (!mrp || !price || !FLoginId) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Missing required product information",
        });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Get existing image
    const [existingProductResult] = await connection.query(
      "SELECT ImageName FROM products WHERE ProductID = ?",
      [id]
    );

    const oldImageName = existingProductResult[0]?.ImageName || "";
    let newImageName = oldImageName;
    let isImageChanging = false;

    if (req.file) {
      newImageName = req.file.filename;
      isImageChanging = true;
    } else if (req.body.useDefaultImage === "true") {
      newImageName = req.body.defaultImageName || "no-image-icon-4.png";
      isImageChanging = newImageName !== oldImageName;
    }

    const params = [
      id,
      parseFloat(mrp),
      parseFloat(price),
      newImageName,
      parseInt(FLoginId),
      Barcode && Barcode.trim() !== "" ? Barcode : null,
      Tax,
      Points,
    ];

    const [results] = await connection.query(
      "CALL updateProduct(?, ?, ?, ?, ?, ?, ?, ?)",
      params
    );

    const result =
      (Array.isArray(results) && results[0]?.[0]) || results?.[0] || results;
    const isSuccessful = result?.status == 1 || result?.affectedRows > 0;

    if (!isSuccessful) {
      if (req.file) {
        const path = require("path");
        const fs = require("fs");
        const filePath = path.join(__dirname, "uploads", req.file.filename);
        fs.unlink(filePath, (err) => {
          if (!err) console.log("Deleted uploaded image due to failed update.");
        });
      }
      await connection.rollback();
      return res
        .status(400)
        .json({ success: false, message: result.message || "Update failed." });
    }

    await connection.commit();

    if (isImageChanging && oldImageName && oldImageName !== newImageName) {
      const path = require("path");
      const fs = require("fs");
      const oldPath = path.join(__dirname, "uploads", oldImageName);
      fs.unlink(oldPath, (err) => {
        if (!err) console.log("Deleted old image:", oldImageName);
      });
    }

    res.json({
      success: true,
      message: result.message || "Product updated successfully",
    });
  } catch (error) {
    console.error("Update error:", error);

    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackErr) {
        console.error("Rollback error:", rollbackErr);
      }
    }

    if (req.file) {
      const path = require("path");
      const fs = require("fs");
      const filePath = path.join(__dirname, "uploads", req.file.filename);
      fs.unlink(filePath, (err) => {
        if (!err) console.log("Deleted image due to error.");
      });
    }

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Barcode must be unique. This barcode is already in use.",
      });
    }

    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  } finally {
    if (connection) connection.release();
  }
});

// Update Product API
// app.put("/product/:id", upload.single("image"), async (req, res) => {
//   try {
//     const { mrp, price, FLoginId, Barcode, Tax, Points } = req.body;
//     const { id } = req.params;

//     console.log("Update request body:", req.body);
//     console.log("File uploaded:", req.file ? req.file.filename : "No file");

//     // Validate required fields
//     if (!mrp || !price || !FLoginId) {
//       return res.status(400).json({
//         success: false,
//         message: "Missing required product information"
//       });
//     }

//     // First, get the existing product to retrieve current image name
//     const [existingProductResult] = await pool.query(
//       'SELECT ImageName FROM products WHERE ProductID = ?',
//       [id]
//     );

//     let oldImageName = null;
//     if (existingProductResult && existingProductResult.length > 0) {
//       oldImageName = existingProductResult[0].ImageName;
//     }

//     console.log("Existing image name:", oldImageName);

//     // ✅ FIX: Better image handling logic
//     let newImageName = null;
//     let isImageChanging = false;

//     if (req.file) {
//       // New image uploaded
//       newImageName = req.file.filename;
//       isImageChanging = true;
//       console.log("New image uploaded:", newImageName);
//     } else if (req.body.keepExistingImage === "true") {
//       // ✅ NEW: Keep existing image flag
//       newImageName = oldImageName;
//       isImageChanging = false;
//       console.log("Keeping existing image:", newImageName);
//     } else if (req.body.useDefaultImage === "true") {
//       // Use default image
//       newImageName = req.body.defaultImageName || "";
//       isImageChanging = (oldImageName !== newImageName);
//       console.log("Using default image:", newImageName);
//     } else {
//       // Fallback: keep existing image
//       newImageName = oldImageName;
//       isImageChanging = false;
//       console.log("Fallback: keeping existing image:", newImageName);
//     }

//     console.log("Final image decision:", {
//       oldImageName,
//       newImageName,
//       isImageChanging
//     });

//     console.log("Calling updateProduct with params:", [id, mrp, price, newImageName, FLoginId, Barcode, Tax, Points]);

//     // Execute the stored procedure to update product
//     const [results] = await pool.query(
//       'CALL updateProduct(?, ?, ?, ?, ?, ?, ?, ?)',
//       [id, mrp, price, newImageName, FLoginId, Barcode && Barcode.trim() !== "" ? Barcode : null, Tax, Points]
//     );

//     // Process the results
//     const processUpdateResults = (results) => {
//       console.log("Raw Update Product Results:", JSON.stringify(results, null, 2));

//       if (Array.isArray(results) && results[0] && results[0].length > 0) {
//         return results[0][0];
//       }

//       if (results[0]) {
//         return results[0];
//       }

//       return results;
//     };

//     const result = processUpdateResults(results);

//     // Check for successful update
//     const isSuccessful =
//       (result && result.status === 1) ||
//       (result && result.status === '1') ||
//       (result && result.affectedRows > 0);

//     if (isSuccessful) {
//       // Only delete old image if image is actually changing and we have a valid old image
//       if (isImageChanging && oldImageName && oldImageName.trim() !== "" && oldImageName !== newImageName) {
//         const fs = require('fs');
//         const path = require('path');

//         const oldImagePath = path.join(__dirname, 'uploads', oldImageName);

//         // Check if old image file exists and delete it
//         fs.access(oldImagePath, fs.constants.F_OK, (err) => {
//           if (!err) {
//             // File exists, delete it
//             fs.unlink(oldImagePath, (unlinkErr) => {
//               if (unlinkErr) {
//                 console.error("Error deleting old image:", unlinkErr);
//               } else {
//                 console.log("Old image deleted successfully:", oldImageName);
//               }
//             });
//           } else {
//             console.log("Old image file not found:", oldImagePath);
//           }
//         });
//       } else {
//         console.log("Image not changing, keeping existing image:", oldImageName);
//       }

//       return res.json({
//         success: true,
//         message: result.message || "Product updated successfully"
//       });
//     } else {
//       // If update failed and a new image was uploaded, delete the new uploaded image
//       if (req.file) {
//         const fs = require('fs');
//         const path = require('path');
//         const newImagePath = path.join(__dirname, 'uploads', req.file.filename);

//         fs.unlink(newImagePath, (unlinkErr) => {
//           if (unlinkErr) {
//             console.error("Error deleting failed upload image:", unlinkErr);
//           } else {
//             console.log("Failed upload image deleted:", req.file.filename);
//           }
//         });
//       }

//       return res.status(400).json({
//         success: false,
//         message: result.message || "Product update failed"
//       });
//     }
//   } catch (error) {
//     console.error("❌ Error updating product:", {
//       errorName: error.name,
//       errorMessage: error.message,
//       errorStack: error.stack
//     });

//     // If there was an error and a new image was uploaded, clean it up
//     if (req.file) {
//       const fs = require('fs');
//       const path = require('path');
//       const newImagePath = path.join(__dirname, 'uploads', req.file.filename);

//       fs.unlink(newImagePath, (unlinkErr) => {
//         if (unlinkErr) {
//           console.error("Error deleting error upload image:", unlinkErr);
//         } else {
//           console.log("Error upload image deleted:", req.file.filename);
//         }
//       });
//     }

//     if (error.code === "ER_DUP_ENTRY") {
//       return res.status(409).json({
//         success: false,
//         message: "Barcode must be unique. This barcode is already in use.",
//       });
//     }

//     // Handle specific database errors
//     if (error.sqlMessage) {
//       return res.status(500).json({
//         success: false,
//         message: "Database error occurred",
//         sqlError: error.sqlMessage
//       });
//     }

//     // Generic server error
//     return res.status(500).json({
//       success: false,
//       message: "Internal server error during product update",
//       errorDetails: error.toString()
//     });
//   }
// });

// app.put("/product/:id", upload.single("image"), async (req, res) => {
//   try {
//     const {mrp,price, FLoginId,Barcode,Tax,Points } = req.body;
//     const { id } = req.params;

//     // Validate required fields
//     if (!mrp  || !price || !FLoginId) {
//       return res.status(400).json({
//         success: false,
//         message: "Missing required product information"
//       });
//     }

//     // Determine image name
//     let imageName = null;
//     if (req.file) {
//       // Use uploaded image
//       imageName = req.file.filename;
//     } else if (req.body.useDefaultImage === "true" && req.body.defaultImageName) {
//       // Use default image
//       imageName = req.body.defaultImageName;
//     } else {
//       // Fetch existing image name if no new image
//       const [existingProduct] = await pool.query(
//         'CALL updateProduct(?)',
//         [id]
//       );
//       imageName = existingProduct[0]?.ImageName || null;
//     }

//     // Execute the stored procedure - REMOVED productName parameter
//     const [results] = await pool.query(
//       'CALL updateProduct(?, ?, ?, ?, ?,?,?,?)',
//       [id, mrp, price, imageName, FLoginId, Barcode, Tax,Points]
//     );

//     // Process the results
//     const processUpdateResults = (results) => {
//       console.log("Raw Update Product Results:", JSON.stringify(results, null, 2));

//       // Handle different possible result structures
//       if (Array.isArray(results) && results[0] && results[0].length > 0) {
//         return results[0][0];
//       }

//       if (results[0]) {
//         return results[0];
//       }

//       return results;
//     };

//     const result = processUpdateResults(results);

//     // Check for successful update
//     const isSuccessful =
//       (result && result.status === 1) ||
//       (result && result.status === '1')||
//       (result && result.affectedRows > 0);
//     if (isSuccessful) {
//       return res.json({
//         success: true,
//         message: result.message || "Product updated successfully"
//       });
//     } else {
//       return res.status(400).json({
//         success: false,
//         message: result.message || "Product update failed"
//       });
//     }
//   } catch (error) {
//     console.error("❌ Error updating product:", {
//       errorName: error.name,
//       errorMessage: error.message,
//       errorStack: error.stack
//     });

//   if (error.code === "ER_DUP_ENTRY") {
//     return res.status(409).json({
//       success: false,
//       message: "Barcode must be unique. This barcode is already in use.",
//     });
//   }
//     // Handle specific database errors
//     if (error.sqlMessage) {
//       return res.status(500).json({
//         success: false,
//         message: "Database error occurred",
//         sqlError: error.sqlMessage
//       });
//     }

//     // Generic server error
//     return res.status(500).json({
//       success: false,
//       message: "Internal server error during product update",
//       errorDetails: error.toString()
//     });
//   }
// });

// app.get("/product", async (req, res) => {
//   try {
//     const userId = req.query.userId;
//     const [rows] = await pool.query("CALL getBillNumber(?)", [userId]);

//     console.log("Response Data:", rows,userId); // Log response to inspect

//     res.json({
//       success: true,
//       FLoginId: rows[0]?.FLoginId || null, // Adjust depending on your response structure
//     });
//   } catch (error) {
//     console.error("Error fetching data:", error);
//     res.status(500).json({
//       success: false,
//       message: "Server error",
//       error: error.message,
//     });
//   }
// });

// app.put("/product/:id", upload.single("image"), async (req, res) => {
//   try {
//     const { productName, price, mrp } = req.body;
//     const { id } = req.params;

//     const [existing] = await pool.query(
//       "SELECT ImageName FROM products WHERE ProductID  = ?",
//       [id]
//     );
//     if (existing.length === 0)
//       return res.status(404).json({ message: "Product not found" });

//     let imageName = existing[0].ImageName;
//     if (req.file) imageName = req.file.filename;

//     await pool.query(
//       "UPDATE products SET ProductName=?, Price=?, MRP=?, ImageName=? WHERE ProductID=?",
//       [productName, price, mrp, imageName, id]
//     );

//     res.json({ success: true, message: "Product updated" });
//   } catch (error) {
//     console.error("❌ Error updating product:", error);
//     res.status(500).json({ success: false, message: "Server error" });
//   }
// });

//save bill items
app.post("/BillSave", async (req, res) => {
  console.log("Request body:", req.body);

  let {
    ProductName,
    MRP,
    Price,
    Qty,
    Total,
    Customer,
    Phone,
    fProductID,
    fLoginID,
    BillNumber,
    Tax,
    Taxable,
    IGSTAmount,
    StaffName,
    selectedCustomerID,
    PointsParsent,
    SGST,
    CGST,
  } = req.body;

  // Validate required fields
  const requiredFields = [
    ProductName,
    MRP,
    Price,
    Qty,
    Total,
    fLoginID,
    fProductID,
    PointsParsent,
  ];
  if (requiredFields.some((field) => field == null)) {
    return res
      .status(400)
      .json({ message: "All required fields must be provided." });
  }

  // ✅ Convert empty or missing selectedCustomerID to NULL
  if (!selectedCustomerID || selectedCustomerID === "") {
    selectedCustomerID = null;
  }

  // 🕓 Get current date & time in India format
  const getIndiaDateTime = () => {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    return `${parts.find((p) => p.type === "year").value}-${
      parts.find((p) => p.type === "month").value
    }-${parts.find((p) => p.type === "day").value} ${
      parts.find((p) => p.type === "hour").value
    }:${parts.find((p) => p.type === "minute").value}:${
      parts.find((p) => p.type === "second").value
    }`;
  };

  const BillDate = getIndiaDateTime();

  try {
    const connection = await pool.getConnection();

    const sql =
      "CALL insertBill(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?,?,?)";

    const [results] = await connection.query(sql, [
      BillDate,
      ProductName,
      MRP,
      Price,
      Qty,
      Total,
      Customer,
      Phone,
      fProductID,
      fLoginID,
      BillNumber,
      Tax,
      Taxable,
      IGSTAmount,
      StaffName,
      selectedCustomerID,
      PointsParsent,
      SGST,
      CGST,
    ]);

    connection.release();

    res.status(201).json({
      success: true,
      message: "Bill saved successfully",
    });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to save product data",
      error: error.message,
    });
  }
});

app.post("/Points", async (req, res) => {
  console.log("Request body:", req.body);

  const { fLoginID, BillNumber, Points, fLedgerID } = req.body;
  // Validate required fields
  const requiredFields = [BillNumber, fLoginID];
  if (requiredFields.some((field) => field == null)) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    const getIndiaDateTime = () => {
      const now = new Date();
      // Create a formatter for India's time zone
      const formatter = new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
      // Format the date
      const parts = formatter.formatToParts(now);
      // Construct the date string in the format you specified
      const BillDate = `${parts.find((p) => p.type === "year").value}-${
        parts.find((p) => p.type === "month").value
      }-${parts.find((p) => p.type === "day").value} ${
        parts.find((p) => p.type === "hour").value
      }:${parts.find((p) => p.type === "minute").value}:${
        parts.find((p) => p.type === "second").value
      }`;

      return BillDate;
    };

    // Example usage
    const BillDate = getIndiaDateTime();
    const connection = await pool.getConnection();

    const sql = "CALL InsertPoints(?, ?, ?, ?,?)";
    const [results] = await connection.query(sql, [
      BillDate,
      BillNumber,
      Points,
      fLoginID,
      fLedgerID,
    ]);

    connection.release();

    res.status(201).json({
      message: "Bill data saved successfully",
    });
  } catch (error) {
    console.error("Database error:", error);
    res
      .status(500)
      .json({ message: "Failed to save bill data", error: error.message });
  }
});

app.get("/getCustomerPoints", async (req, res) => {
  try {
    const userId = req.query.userId;

    const query = "CALL getCustomerPoints(?)";
    const [rows] = await pool.query(query, [userId]);

    const data = rows[0]; // ✅ extract only the actual data rows

    if (!Array.isArray(data)) {
      console.warn("Query result is not an array, returning empty array");
      return res.json([]);
    }

    res.json(data);
  } catch (error) {
    console.error("❌ Error fetching Points:", error);
    res.status(500).json([]);
  }
});

app.get("/getCustomerPointView", async (req, res) => {
  try {
    const { fLoginID, fLedgerID } = req.query;

    const query = "CALL getCustomerPointView(?, ?)";
    const [rows] = await pool.query(query, [fLoginID, fLedgerID]);

    const data = rows[0];
    res.json(data);
  } catch (error) {
    console.error("❌ Error fetching point details:", error);
    res.status(500).json([]);
  }
});

app.get("/getPointsEarned", async (req, res) => {
  try {
    const { fLoginID, fLedgerID } = req.query;

    const query = "CALL getPointsEarned(?, ?)";
    const [rows] = await pool.query(query, [fLoginID, fLedgerID]);

    const data = rows[0];
    res.json(data);
  } catch (error) {
    console.error("❌ Error fetching point details:", error);
    res.status(500).json([]);
  }
});

app.post("/getEarnedPoints", async (req, res) => {
  console.log("Request body:", req.body);

  const { fLoginID, Points, fLedgerID, Narration } = req.body;
  // Validate required fields
  const requiredFields = [fLoginID];
  if (requiredFields.some((field) => field == null)) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    const getIndiaDateTime = () => {
      const now = new Date();
      // Create a formatter for India's time zone
      const formatter = new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
      // Format the date
      const parts = formatter.formatToParts(now);
      // Construct the date string in the format you specified
      const BillDate = `${parts.find((p) => p.type === "year").value}-${
        parts.find((p) => p.type === "month").value
      }-${parts.find((p) => p.type === "day").value} ${
        parts.find((p) => p.type === "hour").value
      }:${parts.find((p) => p.type === "minute").value}:${
        parts.find((p) => p.type === "second").value
      }`;

      return BillDate;
    };

    // Example usage
    const BillDate = getIndiaDateTime();
    const connection = await pool.getConnection();

    const sql = "CALL getEarnedPoints(?, ?, ?, ?,?)";
    const [results] = await connection.query(sql, [
      BillDate,
      Points,
      fLedgerID,
      fLoginID,
      Narration,
    ]);

    connection.release();

    res.status(201).json({
      message: "Ponits Earned successfully",
    });
  } catch (error) {
    console.error("Database error:", error);
    res
      .status(500)
      .json({ message: "Failed to Ponits Earned", error: error.message });
  }
});

// app.post("/productdata", async (req, res) => {
//   const {ProductName,MRP, Price, Qty, Total, Customer, Phone,fProductID ,fLoginId} = req.body;

//   // Validate required fields
//   const requiredFields = [ProductName, MRP, Price, Qty, Total, fLoginId,fProductID];
//   if (requiredFields.some(field => field == null)) {
//     return res.status(400).json({ message: "All fields are required" });
//   }

//   try {
//     const connection = await pool.getConnection();

//     const sql = 'CALL insertBill(?, ?, ?, ?, ?, ?, ?, ?, ?)';

//     const [results] = await connection.query(sql, [

//       ProductName,MRP, Price, Qty, Total, Customer, Phone, fLoginId
//     ]);

//     connection.release();
// console.log("r",results)
//     res.status(201).json({
//       message: "Product data saved successfully",

//       ProductID: results[0][0].insertedId
//     });
//     console.log("s",results[0][0].insertedId)
//   } catch (error) {
//     console.error("Database error:", error);

//     // Handle specific MySQL error for missing fields
//     if (error.sqlState === '45000') {
//       return res.status(400).json({
//         message: "All fields are required"
//       });
//     }

//     res.status(500).json({
//       message: "Failed to save product data",
//       error: error.message
//     });
//   }
// });
//product total billing data
// app.post("/productdata", async (req, res) => {
//   const { Price, Qty, Total, ProductName, MRP, Phone, Customer, FLoginId, ProductID } = req.body;

//   // Validate required fields
//   const requiredFields = [Price, Qty, Total, ProductName, MRP, FLoginId,ProductID];
//   if (requiredFields.some(field => field == null)) {
//     return res.status(400).json({ message: "All fields are required" });
//   }

//   try {
//     const connection = await pool.getConnection();

//     const sql = `
//       INSERT INTO bill
//       (Price, Qty, Total, ProductName, MRP, Phone, Customer, fLoginID,fProductID )
//       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?,?)
//     `;

//     const [result] = await connection.query(sql, [
//       Price,
//       Qty,
//       Total,
//       ProductName,
//       MRP,
//       Phone,
//       Customer,

//       FLoginId,
//       ProductID
//     ]);

//     connection.release();

//     res.status(201).json({
//       message: "Product data saved successfully",
//       productId: result.insertId
//     });
//   } catch (error) {
//     console.error("Database error:", error);
//     res.status(500).json({
//       message: "Failed to save product data",
//       error: error.message
//     });
//   }
// });

// async function getAllProducts() {
//   try {
//     const [rows] = await pool.query("CALL SelectAllOrder();");
//     return rows;  // The data returned from the stored procedure
//   } catch (error) {
//     console.error("Error executing stored procedure:", error);
//     throw error;  // Re-throw error to be handled by the caller
//   }
// }

// // Endpoint to call stored procedure and return data
// app.get("/allproductsdata", async (req, res) => {
//   try {
//     const products = await getAllProducts();
//     res.json(products); // Send the results as a JSON response
//   } catch (error) {
//     console.error("❌ Error fetching BillData:", error);
//     res.status(500).json({ error: 'Error fetching data' });
//   }
// });

app.get("/getSingleCustomerPoints", async (req, res) => {
  // Fixed typo in route name
  try {
    const { fLoginID, fLedgerID } = req.query;

    // Add validation
    if (!fLoginID || !fLedgerID) {
      return res.status(400).json({
        error: "fLoginID and fLedgerID are required",
      });
    }

    const query = "CALL getSingleCusomterPoints(?, ?)"; // Fixed procedure name
    const [rows] = await pool.query(query, [fLoginID, fLedgerID]);

    const data = rows[0];
    res.json(data);
  } catch (error) {
    console.error("❌ Error fetching point details:", error);
    res.status(500).json({ error: "Failed to fetch customer points" });
  }
});

app.get("/getBillNumber", async (req, res) => {
  try {
    const userId = req.query.userId; // Get fLoginID from frontend query

    // Prepare the SQL query
    let query = "CALL getBillNumber(?)";
    let params = [userId]; // Pass fLoginID as parameter

    // Execute query
    const [rows] = await pool.query(query, params);

    // Ensure the query returns an array
    if (!Array.isArray(rows)) {
      console.warn("Query result is not an array, returning empty array");
      return res.json([]); // Return an empty array if the result is not valid
    }

    // Map through the rows if needed and return a consistent structure
    const bill = rows.map((product) => ({
      ...product,
    }));

    // Send the result back to the frontend
    res.json(bill);
  } catch (error) {
    console.error("❌ Error fetching BillData:", error);
    // Handle errors and return an empty array
    res.status(500).json([]);
  }
});

app.get("/allBillItems", async (req, res) => {
  try {
    const userId = req.query.userId;
    const fromDate = req.query.fromDate || null;
    const toDate = req.query.toDate || null;

    // Stored procedure call with all three required parameters
    const query = "CALL getBillingItems(?, ?, ?)";
    const params = [userId || null, fromDate, toDate];

    const [results] = await pool.query(query, params);

    // Handle the results
    const billItems = Array.isArray(results[0]) ? results[0] : results;

    res.json(billItems);
  } catch (error) {
    console.error("❌ Error fetching billing items:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching billing items",
      error: error.message,
    });
  }
});


app.get("/getItemsWisePurchase", async (req, res) => {
  try {
    const userId = req.query.userId;
    const fromDate = req.query.fromDate || null;
    const toDate = req.query.toDate || null;

    // Stored procedure call with all three required parameters
    const query = "CALL getItemsWisePurchase(?, ?, ?)";
    const params = [userId || null, fromDate, toDate];

    const [results] = await pool.query(query, params);

    // Handle the results
    const billItems = Array.isArray(results[0]) ? results[0] : results;

    res.json(billItems);
  } catch (error) {
    console.error("❌ Error fetching billing items:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching billing items",
      error: error.message,
    });
  }
});


// ✅ Get allProductsdata API
//all bill items
// app.get("/allBillItems", async (req, res) => {
//   try {
//     const userId = req.query.userId;

//     // For example, if you have a 'createdBy' column instead of 'userId'
//     let query = "SELECT BillID, Price, Qty, Total, ProductName, MRP, Phone, Customer, BillNumber,BillDate FROM bill";
//     let params = [];

//     if (userId) {
//       // Replace 'userId' with whichever column you actually have that stores user information
//       query += " WHERE fLoginID = ?";  // or whatever column name you have
//       params.push(userId);
//     }

//     const [rows] = await pool.query(query, params);

//     // Make sure we're sending an array
//     if (!Array.isArray(rows)) {
//       console.warn("Query result is not an array, returning empty array");
//       return res.json([]);
//     }

//     const bill = rows.map((product) => ({
//       ...product,
//     }));

//     res.json(bill);
//   } catch (error) {
//     console.error("❌ Error fetching BillData:", error);
//     // Return empty array on error to prevent frontend errors
//     res.status(500).json([]);
//   }
// });

app.get("/getbills", async (req, res) => {
  try {
    const userId = req.query.userId;
    const fromDate = req.query.fromDate || null;
    const toDate = req.query.toDate || null;

    console.log("Fetching bills with parameters:", {
      userId,
      fromDate,
      toDate,
    });

    // Stored procedure call with all three required parameters
    const query = "CALL getBills(?, ?, ?)";
    const params = [userId || null, fromDate, toDate];

    const [results] = await pool.query(query, params);

    // Handle the results
    const billItems = Array.isArray(results[0]) ? results[0] : results;

    res.json(billItems);
  } catch (error) {
    console.error("❌ Error fetching billing items:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching billing items",
      error: error.message,
    });
  }
});

app.delete("/deleteBill", async (req, res) => {
  try {
    const { fLoginID, BillNumber } = req.body;

    if (!fLoginID || !BillNumber) {
      return res.status(400).json({
        success: false,
        error: "Missing required parameters",
      });
    }

    console.log("Deleting bill with params:", { fLoginID, BillNumber });

    const [results] = await pool.query("CALL deleteBill(?, ?)", [
      fLoginID,
      BillNumber,
    ]);

    // Handle the result properly - stored procedure returns array of results
    const procedureResult = results[0][0] || {};
    if (procedureResult.status === 1 && procedureResult.affectedRows > 0) {
      return res.json({
        success: true,
        message: "Bill deleted successfully",
        affectedRows: procedureResult.affectedRows,
      });
    }

    return res.status(404).json({
      success: false,
      error: "Bill not found or unauthorized",
    });
  } catch (error) {
    console.error("Database error:", error);
    return res.status(500).json({
      success: false,
      error: "Database operation failed",
      details: error.message,
    });
  }
});

// app.delete('/deleteBillItems', async (req, res) => {
//   try {
//     const { fLoginID, BillNumber } = req.body;

//     // Validate input
//     if (!fLoginID || !BillNumber) {
//       return res.status(400).json({
//         success: false,
//         error: "Missing required parameters"
//       });
//     }

//     // Call stored procedure
//     const [results] = await pool.query(
//       'CALL deleteBill(?, ?)',
//       [fLoginID, BillNumber]
//     );

//     // Extract procedure result
//     const procedureResult = results[0]?.[0] || {};

//     if (procedureResult.status === 1 || procedureResult.affectedRows > 0) {
//       return res.json({
//         success: true,
//         message: procedureResult.message,
//         affectedRows: procedureResult.affectedRows
//       });
//     }

//     // Bill not found or unauthorized
//     return res.status(404).json({
//       success: false,
//       error: procedureResult.error || 'Bill items not found or unauthorized'
//     });

//   } catch (error) {
//     console.error("Database error:", error);
//     return res.status(500).json({
//       success: false,
//       error: "Database operation failed",
//       details: error.message
//     });
//   }
// });

app.get("/getProductByBarCode", async (req, res) => {
  try {
    const { fLoginID, BarCode } = req.query;

    if (!BarCode || !fLoginID) {
      return res.status(400).json({
        success: false,
        message: "Missing BarCode or fLoginID parameters",
      });
    }

    // Call the stored procedure
    const [results] = await pool.query("CALL getProductByBarCode(?, ?)", [
      fLoginID,
      BarCode,
    ]);

    // Extract data from result sets
    const billHeader = results[0]?.[0] || null;
    const billItems = results[1] || [];
    const customer = results[2]?.[0] || {};

    // ❌ If no product found
    if (!billHeader) {
      return res.status(404).json({
        success: false,
        message: "Barcode is not valid",
      });
    }

    // ✅ Success
    res.json({
      success: true,
      productObj: results,
      items: billItems,
      customer: customer,
    });
  } catch (error) {
    console.error("Error fetching Barcode:", {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
    });

    res.status(500).json({
      success: false,
      message: "Server error while fetching Barcode",
      error: error.message,
    });
  }
});

// app.get("/getProductByBarCode", async (req, res) => {
//   try {
//     const { fLoginID ,BarCode} = req.query;

//     if (!BarCode || !fLoginID) {
//       return res.status(400).json({
//         success: false,
//         message: "Missing billNumber or fLoginID parameters"
//       });
//     }
// if (!billHeader) {
//   return res.status(404).json({
//     success: false,
//     message: "Barcode is not valid"
//   });
// }

// console.log("relt",req,res)
//     // Call the stored procedure
//     const [results] = await pool.query(
//       'CALL getProductByBarCode(?, ?)',
//       [fLoginID, BarCode]
//     );

//     // Process the results from the stored procedure
//     // Assuming the stored procedure returns:
//     // - First result set: Bill header
//     // - Second result set: Bill items
//     // - Third result set: Customer details (if available)
//      const billHeader = results[0]?.[0] || null;
//      const billItems = results[1] || [];
//      const customer = results[2]?.[0] || {};

//     if (!billHeader) {
//       return res.status(404).json({
//         success: false,
//         message: "Barcode is not valid"
//       });
//     }

//     res.json({
//       success: true,
//       productObj: results,
//       items: billItems,
//       customer: customer
//     });

//   } catch (error) {
//     console.error("Error fetching Barcode:", {
//       errorName: error.name,
//       errorMessage: error.message,
//       errorStack: error.stack
//     });

//     res.status(500).json({
//       success: false,
//       message: "Server error while fetching Barcode",
//       error: error.message
//     });
//   }
// });
// Add this to your server routes
app.get("/getsBillToBilling", async (req, res) => {
  try {
    const { fLoginID, billNumber } = req.query;

    if (!billNumber || !fLoginID) {
      return res.status(400).json({
        success: false,
        message: "Missing billNumber or fLoginID parameters",
      });
    }

    // Call the stored procedure
    const [results] = await pool.query("CALL getOneBillItems(?, ?)", [
      fLoginID,
      billNumber,
    ]);

    // Process the results from the stored procedure
    // Assuming the stored procedure returns:
    // - First result set: Bill header
    // - Second result set: Bill items
    // - Third result set: Customer details (if available)
    const billHeader = results[0]?.[0] || null;
    const billItems = results[1] || [];
    const customer = results[2]?.[0] || {};

    if (!billHeader) {
      return res.status(404).json({
        success: false,
        message: "Bill not found",
      });
    }

    res.json({
      success: true,
      bill: results,
      items: billItems,
      customer: customer,
    });
  } catch (error) {
    console.error("Error fetching bill:", {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
    });

    res.status(500).json({
      success: false,
      message: "Server error while fetching bill",
      error: error.message,
    });
  }
});

// Add this to your server routes
// app.get("/getsBillToBilling", async (req, res) => {
//   try {
//     const { fLoginID, billNumber } = req.query;

//     if (!billNumber || !fLoginID) {
//       return res.status(400).json({
//         success: false,
//         message: "Missing billNumber or fLoginID parameters"
//       });
//     }

//     // Call the stored procedure
//     const [results] = await pool.query(
//       'CALL getOneBillItems(?, ?)',
//       [fLoginID, billNumber]
//     );

//     // MySQL returns stored procedure results in a specific format
//     // where each result set is an element in the array
//     console.log("Raw stored procedure results:", results);

//     // The first element (results[0]) typically contains the bill header
//     const billHeader = results[0]?.[0] || null;

//     // For multiple items, they should be in the second result set (results[1])
//     // If results[1] is undefined, it means the stored procedure doesn't return multiple items
//     let billItems = [];

//     // Check if there's a second result set (which would contain the items)
//     if (results.length > 1) {
//       billItems = results[1];
//     } else if (results[0] && results[0].length > 1) {
//       // If all items are in the first result set (and not just the header)
//       // Skip the first item (header) and take the rest as items
//       billItems = results[0].slice(1);
//     } else if (results[0] && results[0].length === 1 && results[0][0].hasOwnProperty('items')) {
//       // If items are nested in the first result
//       billItems = results[0][0].items || [];
//     }

//     console.log("Extracted bill items:", billItems);

//     // Get customer details from the third result set if available
//     const customer = results[2]?.[0] || {};

//     if (!billHeader) {
//       return res.status(404).json({
//         success: false,
//         message: "Bill not found"
//       });
//     }

//     res.json({
//       success: true,
//       bill: billHeader,
//       items: billItems, // This should now contain all bill items
//       customer: customer
//     });

//   } catch (error) {
//     console.error("Error fetching bill:", {
//       errorName: error.name,
//       errorMessage: error.message,
//       errorStack: error.stack
//     });

//     res.status(500).json({
//       success: false,
//       message: "Server error while fetching bill",
//       error: error.message
//     });
//   }
// });
app.get("/getAccountsHistory", async (req, res) => {
  try {
    const fLoginID = req.query.fLoginID;
    const fromDate = req.query.fromDate || null;
    const toDate = req.query.toDate || null;

    console.log("📥 Fetching accounts with:", { fLoginID, fromDate, toDate });

    const query = "CALL getAccountsHistory(?, ?, ?)";
    const params = [fLoginID || null, fromDate, toDate];

    const [results] = await pool.query(query, params);
    const accountsData = results[0]; // First array contains result set

    res.json(accountsData);
  } catch (error) {
    console.error("❌ Error fetching Accounts History:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching Accounts History",
      error: error.message,
    });
  }
});

app.get("/getsolidItems", async (req, res) => {
  try {
    const userId = req.query.userId;
    const fromDate = req.query.fromDate || null;
    const toDate = req.query.toDate || null;

    console.log("Fetching bills with parameters:", {
      userId,
      fromDate,
      toDate,
    });

    // Stored procedure call with all three required parameters
    const query = "CALL getSoldItems(?, ?, ?)";
    const params = [userId || null, fromDate, toDate];

    const [results] = await pool.query(query, params);

    // Handle the results
    const billItems = Array.isArray(results[0]) ? results[0] : results;

    res.json(billItems);
    console.log("I", billItems);
  } catch (error) {
    console.error("❌ Error fetching billing items:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching billing items",
      error: error.message,
    });
  }
});

app.get("/allCustomers", async (req, res) => {
  try {
    const userId = req.query.userId;

    console.log("Fetching bills with parameters:", {
      userId,
    });

    // Stored procedure call with all three required parameters
    const query = "CALL allCustomers(?)";
    const params = [userId || null];

    const [results] = await pool.query(query, params);

    // Handle the results
    const billItems = Array.isArray(results[0]) ? results[0] : results;

    res.json(billItems);
  } catch (error) {
    console.error("❌ Error fetching billing items:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching billing items",
      error: error.message,
    });
  }
});

//   INSERT INTO logins (PhoneNumber, Password, IsEnable, ValidityDate)
// VALUES (123456789, '123456', true, '2025-03-18');
// Backend API endpoint correction
// app.put("/update", async (req, res) => {
//   console.log("Request body:", req.body);

//   const { LoginID, BusinessName, Address, GSTIN, BillMobile, BillFormat } = req.body;

//   // Validate required fields
//   if (!LoginID || !BusinessName) {
//     return res.status(400).json({
//       success: false,
//       message: "LoginID and BusinessName are required"
//     });
//   }

//   try {
//     const connection = await pool.getConnection();

//     // Fixed SQL parameter order to match the parameter array
//     const sql = "UPDATE login SET BusinessName = ?, Address = ?, GSTIN = ?, BillMobile = ?, BillFormat = ? WHERE LoginID = ?";

//     const [result] = await connection.query(sql, [
//       BusinessName,
//       Address || null,
//       GSTIN || null,
//       BillMobile || null,
//       BillFormat || null,
//       LoginID
//     ]);

//     connection.release();

//     console.log("Update result:", result);

//     if (result.affectedRows === 0) {
//       return res.status(404).json({
//         success: false,
//         message: "User not found or no changes made"
//       });
//     }

//     res.status(200).json({
//       success: true,
//       message: "Profile updated successfully",
//       affectedRows: result.affectedRows
//     });
//   } catch (error) {
//     console.error("Database error:", error);
//     res.status(500).json({
//       success: false,
//       message: "Failed to update profile",
//       error: error.message
//     });
//   }
// });

app.post("/insertaccount", async (req, res) => {
  let { fLedgerID, Debit, Credit, Narration, fBillNumber, fLoginID, DateTime } =
    req.body;

  console.log(
    fLedgerID,
    Debit,
    Credit,
    Narration,
    fBillNumber,
    fLoginID,
    DateTime
  );
  try {
    const conn = await pool.getConnection();

    // Convert blank fBillNumber to null
    if (!fBillNumber || fBillNumber.trim() === "") {
      fBillNumber = null;
    }

    const [result] = await conn.query(
      "CALL InsertAccounts(?, ?, ?, ?, ?, ?, ?)",
      [fLedgerID, Debit, Credit, Narration, fBillNumber, fLoginID, DateTime]
    );

    console.log("Stored Procedure Result:", result);

    conn.release();

    res.status(200).json({
      success: true, // 👈 ADD THIS
      message: "Account inserted successfully.",
      result: result,
    });
  } catch (error) {
    console.error("Insert error:", error);
    res.status(500).json({
      message: "Failed to insert account.",
      error: error.message,
    });
  }
});

app.delete("/deleteaccount", async (req, res) => {
  const { fBillNumber, fLoginID } = req.body;

  try {
    const conn = await pool.getConnection();

    const [result] = await conn.query("CALL DeleteAccounts(?, ?)", [
      fBillNumber,
      fLoginID,
    ]);

    conn.release();

    res.status(200).json({
      message: "Account deleted successfully.",
      result: result,
    });
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).json({
      message: "Failed to delete account.",
      error: error.message,
    });
  }
});

app.post("/updatepassword", async (req, res) => {
  const { LoginID, OldPassword, NewPassword } = req.body;

  try {
    const conn = await pool.getConnection();

    const [result] = await conn.query("CALL UpdatePassword(?, ?, ?)", [
      LoginID,
      OldPassword,
      NewPassword,
    ]);

    console.log("Stored Procedure Result:", result);

    conn.release();

    res.status(200).json({
      success: true,
      message: "Password updated successfully.",
      result: result,
    });
  } catch (error) {
    console.error("Password update error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update password.",
      error: error.message,
    });
  }
});

app.put("/updateFirm", async (req, res) => {
  const {
    LoginID,
    BusinessName,
    Address,
    GSTIN,
    BillMobile,
    BillFormat,
    UPI,
    StateCode,
  } = req.body;

  if (!LoginID || !BusinessName) {
    return res.status(400).json({
      success: false,
      message: "LoginID and BusinessName are required",
    });
  }

  try {
    const connection = await pool.getConnection();

    const [result] = await connection.query(
      "CALL UpdateFirm(?, ?, ?, ?, ?, ?,?,?)",
      [
        LoginID,
        BusinessName,
        Address,
        GSTIN,
        BillMobile,
        BillFormat,
        UPI,
        StateCode,
      ]
    );

    connection.release();

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: result, // Include result data if needed
    });
  } catch (error) {
    console.error("Stored procedure error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update profile",
      error: error.message,
    });
  }
});

app.get("/getAllLedgerName", async (req, res) => {
  const fLoginID = req.query.fLoginID;
  try {
    const connection = await pool.getConnection();
    const sql = "CALL getAllLedgerName(?)";
    const [rows] = await connection.query(sql, [fLoginID]);
    connection.release();
    res.status(200).json({
      success: true,
      data: rows[0],
    });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve Ledger Names",
      error: error.message,
    });
  }
});

app.get("/getBalanceSheet", async (req, res) => {
  const fLoginID = req.query.fLoginID;
  try {
    const connection = await pool.getConnection();
    const sql = "CALL getBalanceSheet(?)";
    const [rows] = await connection.query(sql, [fLoginID]);
    connection.release();
    res.status(200).json({
      success: true,
      data: rows[0],
    });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve BalanceSheet",
      error: error.message,
    });
  }
});

//admin controller
app.post("/AdminLogin", async (req, res) => {
  const {
    password,
    phoneNumber,
    businessName,
    Address,
    GSTIN,
    BillMobile,
    IsEnable,
    ValidityDate,
    BillFormat,
    EnableStaff,
    EnableWhatsApp,
    WhatsAppAPI,
    EnablePoints,
    UPI,
    Details,
    RateTag,
    StateCode,
    EnableAccounts,
    OnlyRateTag,
  } = req.body;
  console.log("Request body:", req.body);
  // Validate required fields
  if (!password || !phoneNumber || !businessName || !BillFormat) {
    return res.status(400).json({
      success: false,
      message: "Password, phoneNumber, and businessName are required",
    });
  }

  try {
    const connection = await pool.getConnection();

    const sql = "CALL Admin(?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?,?,?,?,?,?,?,?,?)";

    const [rows] = await connection.query(sql, [
      businessName,
      phoneNumber,
      password,
      IsEnable,
      ValidityDate,
      Address,
      BillMobile,
      EnableStaff,
      BillFormat,
      GSTIN,
      EnableWhatsApp,
      WhatsAppAPI,
      EnablePoints,
      UPI,
      Details,
      RateTag,
      StateCode,
      EnableAccounts,
      OnlyRateTag,
    ]);

    connection.release();

    res.status(201).json({
      success: true,
      message: "Created successfully",
    });
  } catch (error) {
    console.error("Database error:", error);
    
        if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Phone number already exists for another user. Please use a different number.",
      });
    }
    res.status(500).json({
      success: false,
      message: "Failed to create account",
      error: error.message,
    });
  }
});

//admin gets to users
app.get("/getUser", async (req, res) => {
  try {
    const connection = await pool.getConnection();

    const sql = "CALL getUser()";
    const [rows] = await connection.query(sql); // No parameters passed

    connection.release();

    res.status(200).json({
      success: true,
      data: rows[0], // rows[0] contains the result set
    });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve logins",
      error: error.message,
    });
  }
});

//update Users
app.post("/updateUser", async (req, res) => {
  const {
    LoginID,
    businessName,
    phoneNumber,
    password,
    IsEnable,
    ValidityDate,
    Address,
    BillMobile,
    EnableStaff,
    BillFormat,
    GSTIN,
    EnableWhatsApp,
    WhatsAppAPI,
    EnablePoints,
    UPI,
    Details,
    RateTag,
    StateCode,
    EnableAccounts,
    OnlyRateTag,
  } = req.body;

  if (!LoginID) {
    return res.status(400).json({ success: false, message: "LoginID is required" });
  }

  try {
    const connection = await pool.getConnection();

    const sql = "CALL UpdateUsers(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    const params = [
      LoginID,
      businessName,
      phoneNumber,
      password,
      IsEnable,
      ValidityDate,
      Address,
      BillMobile,
      EnableStaff,
      BillFormat,
      GSTIN,
      EnableWhatsApp,
      WhatsAppAPI,
      EnablePoints,
      UPI,
      Details,
      RateTag,
      StateCode,
      EnableAccounts,
      OnlyRateTag,
    ];

    await connection.query(sql, params);
    connection.release();

    res.status(200).json({ success: true, message: "User updated successfully" });
  } catch (error) {
    console.error("Database error:", error);

    // Duplicate phone number
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Phone number already exists for another user. Please use a different number.",
      });
    }

    // Generic DB error
    res.status(500).json({
      success: false,
      message: "Failed to update user",
      error: error.message,
    });
  }
});


// DELETE endpoint to call DeleteUser stored procedure
app.delete("/DeleteUser", async (req, res) => {
  try {
    const { LoginID } = req.body;

    // Validate input
    if (!LoginID) {
      return res.status(400).json({
        success: false,
        error: "Missing required parameter: LoginID",
      });
    }

    const conn = await pool.getConnection();
    try {
      // Call stored procedure
      await conn.query("CALL DeleteUser(?)", [LoginID]);

      res.json({
        success: true,
        message: `User with LoginID ${LoginID} deleted successfully`,
      });
    } finally {
      conn.release(); // Always release connection back to pool
    }
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({
      success: false,
      error: "Internal Server Error",
    });
  }
});

//getRateTag
app.get("/getRateTag", async (req, res) => {
  const fLoginID = req.query.fLoginID;
  try {
    const connection = await pool.getConnection();
    const sql = "CALL getRateTag(?)"; // Pass fLoginID to stored procedure
    const [rows] = await connection.query(sql, [fLoginID]); // ✅ Pass parameter
    connection.release();
    res.status(200).json({
      success: true,
      data: rows[0], // Return first result set
    });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve rate tags",
      error: error.message,
    });
  }
});

//GetRatetagStock
app.get("/getRateTagStock", async (req, res) => {
  const fProductID = req.query.fProductID;
  const fLoginID = req.query.fLoginID;
  try {
    const connection = await pool.getConnection();
    const sql = "CALL getRateTagStock(?,?)"; 
    const [rows] = await connection.query(sql, [fProductID, fLoginID]); // ✅ Pass parameter
    connection.release();
    res.status(200).json({
      success: true,
      data: rows[0], // Return first result set
    });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve rate tags",
      error: error.message,
    });
  }
});

app.get("/getBarcodeRateTag", async (req, res) => {
  const { Barcode, fLoginID } = req.query;

  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.query("CALL getBarcodetoRateTag(?, ?)", [fLoginID, Barcode]);
    connection.release();

    const result = rows[0];

    // ✅ If stored procedure returned error message
    if (result.length === 1 && result[0].status === "Error") {
      return res.status(200).json({
        success: false,
        message: result[0].message,
      });
    }

    // ✅ If data found
    if (result && result.length > 0) {
      return res.status(200).json({
        success: true,
        data: result,
      });
    }

    // ✅ No data found
    return res.status(200).json({
      success: false,
      message: "No data found for this barcode.",
    });

  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve rate tags",
      error: error.message,
    });
  }
});


app.post("/signup", async (req, res) => {
  const {
    password,
    phoneNumber,
    businessName,
    Address,
    GSTIN,
    BillMobile,
    BillFormat,
  } = req.body;

  // Validate required fields
  if (!password || !phoneNumber || !businessName) {
    return res.status(400).json({
      success: false,
      message: "All fields are required",
    });
  }

  try {
    const connection = await pool.getConnection();

    const sql = "CALL insertLogin(?, ?, ?,?,?,?,?)";

    const [result] = await connection.query(sql, [
      businessName,
      phoneNumber,
      password,
      Address,
      GSTIN,
      BillMobile,
      BillFormat,
    ]);

    connection.release();

    res.status(201).json({
      success: true,
      message: "Created successfully",
      productId: result.insertId,
    });
  } catch (error) {
    console.error("Database error:", error);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Phone number already exists. Please try logging in.",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to create account",
      error: error.message,
    });
  }
});

// app.post("/api/sinup",  async (req, res) => {

//   // Check for validation errors
//   const errors = validationResult(req);
//   if (!errors.isEmpty()) {
//     return res.status(400).json({
//       success: false,
//       errors: errors.array()
//     });
//   }

//   const { phoneNumber, password, businessName } = req.body;

//   try {
//     // Check if user already exists
//     const [existingUser] = await pool.query(
//       'SELECT * FROM `login` WHERE PhoneNumber = ?',
//       [phoneNumber]
//     );

//     if (existingUser.length > 0) {
//       return res.status(409).json({
//         success: false,
//         message: "Phone number is already registered"
//       });
//     }

//     // Hash the password
//     const saltRounds = 12;
//     const hashedPassword = await bcrypt.hash(password, saltRounds);

//     // Set validity date (e.g., 1 year from now)
//     const validityDate = new Date();
//     validityDate.setFullYear(validityDate.getFullYear() + 1);

//     // Prepare user data for insertion
//     const newUser = {
//       PhoneNumber: phoneNumber,
//       Password: hashedPassword,
//       BusinessName: businessName,
//       IsEnable: 1, // Default to enabled
//       ValidityDate: validityDate,
//       CreatedAt: new Date()
//     };

//     // Insert new user
//     const [result] = await pool.query(
//       'INSERT INTO `login` SET ?',
//       [newUser]
//     );

//     // Log successful signup
//     console.log(`New user registered: ${phoneNumber} - Business: ${businessName}`);

//     // Return success response
//     return res.status(201).json({
//       success: true,
//       message: "Account created successfully",
//       userId: result.insertId
//     });

//   } catch (error) {
//     // Comprehensive error logging
//     console.error("Signup Error:", {
//       message: error.message,
//       stack: error.stack,
//       input: { phoneNumber, businessName }
//     });

//     return res.status(500).json({
//       success: false,
//       message: "Unable to complete registration. Please try again."
//     });
//   }
// });

// Login stored pro..

// app.post("/api/login", async (req, res) => {
//   const { phoneNumber, password } = req.body;

//   if (!phoneNumber || !password) {
//     return res.status(400).json({
//       success: false,
//       message: "Phone number and password are required",
//     });
//   }

//   try {
//     // Execute stored procedure
//     const [results] = await pool.query(
//       'CALL insertLogin(?, ?)',
//       [phoneNumber, password]
//     );

//     // The first result set contains our login result
//     const loginResult = results[0][0];

//     // Handle response based on stored procedure result
//     if (!loginResult.success) {
//       return res.status(loginResult.message.includes('expired') ? 403 : 401).json({
//         success: loginResult.success,
//         message: loginResult.message,
//       });
//     }

//     return res.status(200).json({
//       success: loginResult.success,
//       id: loginResult.userId,
//       message: loginResult.message,
//       user: loginResult.userData,
//     });
//   } catch (error) {
//     console.error("❌ Database error:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Database error. Please try again.",
//     });
//   }
// });

// app.post("/api/login", async (req, res) => {
//   const { phoneNumber, password } = req.body;

//   // Input validation
//   if (!phoneNumber || !password) {
//     return res.status(400).json({
//       success: false,
//       message: "Phone number and password are required",
//     });
//   }

//   try {
//     // Call the stored procedure
//     const [results] = await pool.query(
//       'CALL checkLogin(?, ?)',
//       [phoneNumber, password]
//     );

//     // MySQL returns the result in the first element of the results array
//     const loginResult = results[0][0];

//     // Check the login status
//     if (loginResult.status === 0) {
//       return res.status(401).json({
//         success: false,
//         message: loginResult.message,
//       });
//     }

//     // Login successful
//     return res.status(200).json({
//       success: true,
//       id: loginResult.id,
//       message: loginResult.message,
//       user: loginResult.user, // This is already a JSON object
//     });

//   } catch (error) {
//     console.error("Login error:", error);
//     return res.status(500).json({
//       success: false,
//       message: "An unexpected error occurred. Please try again later.",
//     });
//   }
// });

// app.post("/login", async (req, res) => {
//   const { phoneNumber, password } = req.body;
//   console.log("Phone Number:", phoneNumber);
//   console.log("Password:", password);

//   // Validate input
//   if (!phoneNumber || !password) {
//     return res.status(400).json({
//       success: false,
//       message: "Phone number and password are required",
//     });
//   }

//   try {
//     // Correct order of parameters: phoneNumber first, then password
//     const [results] = await pool.query('CALL checkLogin(?,?)', [phoneNumber,password]);
//     console.log("Results:", results);  // Log the results to understand the structure
//     // Log the full results to understand the structure

//     // Check if results exist and have the expected structure
//     if (results && results[0] && results[0][0]) {

//       const loginResult = results[0][0];

//       console.log("login Result:", loginResult);
//       if (loginResult>'0') {
//         console.log("Full Results2:", results[0][0]);
//         return res.status(200).json(loginResult);
//       } else {
//         return res.status(401).json(loginResult);
//       }
//     } else {
//       // If no results are returned
//       return res.status(401).json({
//         success: false,
//         message: "Invalid login credentials"
//       });
//     }
//   } catch (error) {
//     console.error("Login Error:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Database error. Please try again.",
//     });
//   }
// });

app.get("/login", async (req, res) => {
  const { phoneNumber, password } = req.query;

  console.log("Phone Number:", phoneNumber);
  console.log("Password:", password);

  // Validate input
  if (!phoneNumber || !password) {
    return res.status(400).json({
      success: false,
      message: "Phone number and password are required",
    });
  }

  try {
    const [results] = await pool.query("CALL checkLogin(?, ?)", [
      phoneNumber,
      password,
    ]);

    if (results && results[0] && results[0][0]) {
      const loginResult = results[0][0];
      console.log("Login Result:", loginResult);

      if (loginResult > "0") {
        return res.status(200).json(loginResult);
      } else {
        return res.status(401).json(loginResult);
      }
    } else {
      return res.status(401).json({
        success: false,
        message: "Invalid login credentials",
      });
    }
  } catch (error) {
    console.error("Login Error:", error);
    return res.status(500).json({
      success: false,
      message: "Database error. Please try again.",
      error: error.message,
    });
  }
});

app.post("/insertpurchase", async (req, res) => {
  console.log("Request body:", req.body);

  const {
    PurchaseDate,
    fLID,
    productID,
    qty,
    buyPrice,
    description,
    fLoginID,
    BillNo,
    ProductName,
    TotalSum,
    Tax,
    Taxable,
    IGSTAmount,
    SGST,
    CGST,
  } = req.body;

  const requiredFields = [
    PurchaseDate,
    fLID,
    productID,
    qty,
    buyPrice,
    fLoginID,
    BillNo,
    ProductName,
    TotalSum,
    Tax,
    Taxable,
    IGSTAmount,
    SGST,
    CGST,
  ];

  if (requiredFields.some((field) => field == null || field === "")) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    const connection = await pool.getConnection();

    const sql = `
      CALL insertPurchase( ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? )`;
       

    const [results] = await connection.query(sql, [
      PurchaseDate,
      productID,
      qty,
      buyPrice,
      description,
      fLoginID,
       fLID,
      BillNo,
      ProductName,
      TotalSum,
      Tax,
      Taxable,
      IGSTAmount,
      SGST,
      CGST,
    ]);

    console.log("Insert results:", results);

    connection.release();

    res.status(201).json({ message: "Purchase inserted successfully" });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({
      message: "Failed to insert purchase",
      error: error.message,
    });
  }
});

// app.post("/insertpurchase", async (req, res) => {
//   console.log("Request body:", req.body);

//   const { PurchaseDate,fID, productID, qty, byPrice, description, fLoginID } = req.body;

//   const requiredFields = [PurchaseDate,fID, productID, qty, byPrice, fLoginID];
//   if (requiredFields.some((field) => field == null || field === "")) {
//     return res.status(400).json({ message: "All fields are required" });
//   }

//   try {
//     const connection = await pool.getConnection();

//     const sql = "CALL insertPurchase(?, ?, ?, ?, ?, ?,?)";
//     const [results] = await connection.query(sql, [
//       PurchaseDate,
//       productID,
//       qty,
//       byPrice,
//       description,
//       fLoginID,
//       fID,
//     ]);

// console.log("mainr",results)
//     connection.release();

//     res.status(201).json({ message: "Product data saved successfully" });
//   } catch (error) {
//     console.error("Database error:", error);
//     res.status(500).json({
//       message: "Failed to save product data",
//       error: error.message,
//     });
//   }
// });

// app.get("/insertPurchaseByDate", async (req, res) => {
//   try {
//     const userId = req.query.userId;
//     const fromDate = req.query.fromDate || null;
//     const toDate = req.query.toDate || null;

//     if (!userId) {
//       return res.status(400).json({ error: "Missing userId" });
//     }

//     // Stored procedure call with all three required parameters
//     const query = "CALL insertPurchaseByDate(?,?,?)";
//     const params = [userId || null, fromDate, toDate];

//     const [results] = await pool.query(query, params);

//     // Handle the results
//     const billItems = Array.isArray(results[0]) ? results[0] : results;

//     res.json(billItems);

//   } catch (error) {
//     console.error("❌ Error fetching billing items:", error);
//     res.status(500).json({
//       success: false,
//       message: "Server error while fetching billing items",
//       error: error.message
//     });
//   }
// });

app.post("/getPurchaseBill", async (req, res) => {
  const { fLoginID, fromDate, toDate } = req.body;

  // Check for required fields
  if (!fLoginID || !fromDate || !toDate) {
    return res.status(400).json({ message: "fLoginID, fromDate and toDate are required" });
  }

  try {
    const connection = await pool.getConnection();

    const sql = `CALL getPurchaseBill(?, ?, ?)`;

    const [results] = await connection.query(sql, [fLoginID, fromDate, toDate]);

    connection.release();

    // `results[0]` holds actual data from SELECT
    res.status(200).json({ data: results[0] });

  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({
      message: "Failed to fetch purchase summary",
      error: error.message,
    });
  }
});







// Get all purchase data
app.get("/getPurchaseByDate", async (req, res) => {
  try {
    const userId = req.query.userId;
    const fromDate = req.query.fromDate || null;
    const toDate = req.query.toDate || null;

    if (!userId) {
      return res.status(400).json({ error: "Missing userId" });
    }

    // Assuming your stored procedure accepts 3 parameters: (userId, fromDate, toDate)
    const query = "CALL getPurchaseByDate(?, ?, ?)";
    const params = [userId, fromDate, toDate];
    //  console.log("params",params)
    const [rows] = await pool.query(query, params);
    const purchaseData =
      Array.isArray(rows) && Array.isArray(rows[0]) ? rows[0] : [];

    res.json(purchaseData);
    // console.log("✅ Purchase Data fetched:", purchaseData);
  } catch (error) {
    console.error("❌ Error fetching purchase data:", error);
    res.status(500).json({ error: "Failed to fetch purchase data" });
  }
});

app.put("/updatePurchase", async (req, res) => {
  const {
    PurchaseDate,
    fLID,
    ProductID,
    QTY,
    BuyPrice,
    Description,
    fLoginID,
    PID,
  } = req.body;

  try {
    const [result] = await pool.query(
      "CALL UpdatePurchase(?, ?, ?, ?, ?, ?, ?, ?)",
      [PurchaseDate, fLID, ProductID, QTY, BuyPrice, Description, fLoginID, PID]
    );

    res.json({
      success: true,
      message: "Purchase updated successfully",
      result,
    });
  } catch (error) {
    console.error("Update error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update purchase",
      error: error.message,
    });
  }
});

// Fixed backend endpoint
app.post("/getPurchaseDetails", async (req, res) => {
  const { p_fProductID, p_fLoginID } = req.body;

  if (!p_fProductID || !p_fLoginID) {
    return res.status(400).json({ error: "Missing product ID or login ID" });
  }

  try {
    // Fixed parameter order to match frontend
    const [rows] = await pool.query(
      "CALL getProductPurchaseHistory(?, ?);",
      [p_fLoginID, p_fProductID] // Fixed order
    );

    res.json(rows[0]);
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/getProductBillHistory", async (req, res) => {
  const { p_fProductID, p_fLoginID } = req.body;

  if (!p_fProductID || !p_fLoginID) {
    return res.status(400).json({ error: "Missing product ID or login ID" });
  }

  try {
    // Fixed parameter order to match frontend
    const [rows] = await pool.query(
      "CALL getProductBillHistory(?, ?);",
      [p_fLoginID, p_fProductID] // Fixed order
    );

    res.json(rows[0]);
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// app.get("/insertPurchaseByDate", async (req, res) => {
//   try {
//     const userId = req.query.userId;
//     const fromDate = req.query.fromDate || null;
//     const toDate = req.query.toDate || null;
//     const productName = req.query.productName || null;

//     if (!userId) {
//       return res.status(400).json({ error: "Missing userId" });
//     }

//     // Modify the query to include productName if provided
//     let query = "CALL insertPurchaseByDate(?, ?, ?)";
//     const params = [userId, fromDate, toDate];

//     if (productName) {
//       query = "CALL insertPurchaseByDateWithProductName(?, ?, ?, ?)";
//       params.push(`%${productName}%`); // Use a wildcard for partial matching
//     }

//     console.log("params", params);
//     const [rows] = await pool.query(query, params);
//     const purchaseData = Array.isArray(rows) && Array.isArray(rows[0]) ? rows[0] : [];

//     res.json(purchaseData);
//     console.log("✅ Purchase Data fetched:", purchaseData);
//   } catch (error) {
//     console.error("❌ Error fetching purchase data:", error);
//     res.status(500).json({ error: "Failed to fetch purchase data" });
//   }
// });

app.get("/getPurchaseItem", async (req, res) => {
  try {
    const userId = req.query.userId;
    const fromDate = req.query.fromDate || null;
    const toDate = req.query.toDate || null;

    if (!userId) {
      return res.status(400).json({ error: "Missing userId" });
    }

    // Assuming your stored procedure accepts 3 parameters: (userId, fromDate, toDate)
    const query = "CALL getPurchaseItem(?, ?, ?)";
    const params = [userId, fromDate, toDate];
    //  console.log("params",params)
    const [rows] = await pool.query(query, params);
    const purchaseData =
      Array.isArray(rows) && Array.isArray(rows[0]) ? rows[0] : [];

    res.json(purchaseData);
    // console.log("✅ Purchase Data fetched:", purchaseData);
  } catch (error) {
    console.error("❌ Error fetching purchase data:", error);
    res.status(500).json({ error: "Failed to fetch purchase data" });
  }
});

//gets Party Purchase
app.get("/PartyPurchase", async (req, res) => {
  try {
    const userId = req.query.userId;
    const fromDate = req.query.fromDate || null;
    const toDate = req.query.toDate || null;

    if (!userId) {
      return res.status(400).json({ error: "Missing userId" });
    }

    // Assuming your stored procedure accepts 3 parameters: (userId, fromDate, toDate)
    const query = "CALL getPartyPurchase(?, ?, ?)";
    const params = [userId, fromDate, toDate];
    //  console.log("params",params)
    const [rows] = await pool.query(query, params);
    const PartyPurchase =
      Array.isArray(rows) && Array.isArray(rows[0]) ? rows[0] : [];

    res.json(PartyPurchase);
  } catch (error) {
    console.error("❌ Error fetching Party Purchase:", error);
    res.status(500).json({ error: "Failed to fetch Party Purchase" });
  }
});

// app.delete('/deletepurchase', (req, res) => {
//   const { fLoginID, PID } = req.body;

//   if (!fLoginID || !PID) {
//     return res.status(400).json({ error: 'Missing fLoginID or PID' });
//   }

//   console.log(`Attempting to delete purchase with PID: ${PID} for user ${fLoginID}`);

//   const sql = 'CALL DeletePurchase(?, ?)';

//   query(sql, [fLoginID, PID], (err, results) => {
//     if (err) {
//       console.error('Error calling DeletePurchase:', err);
//       return res.status(500).json({ error: 'Failed to delete purchase: ' + err.message });
//     }

//     res.json({ message: 'Purchase deleted successfully' });
//   });
// });
//WERTYU
app.delete("/deletepurchase", async (req, res) => {
  try {
    // console.log("Delete request received:", req.body);
    const { fLoginID, PID } = req.body;

    // Validate input
    if (!fLoginID || !PID) {
      console.log("Missing required parameters:", { fLoginID, PID });
      return res.status(400).json({
        success: false,
        error: "Missing required parameters",
      });
    }

    // console.log("Calling DeletePurchase with:", { PID, fLoginID });

    // Call stored procedure - MAKE SURE THE ORDER MATCHES YOUR PROCEDURE DEFINITION
    const [results] = await pool.query("CALL DeletePurchase(?, ?)", [
      PID,
      fLoginID,
    ]);

    // console.log("Stored procedure results:", JSON.stringify(results));

    // Extract procedure result
    const procedureResult = results || {};
    // console.log("Procedure result:", procedureResult);

    // Check if deletion was successful
    // Depending on your stored procedure, it might indicate success differently
    if (procedureResult.status === 1 || procedureResult.affectedRows > 0) {
      return res.json({
        success: true,
        message: procedureResult.message || "Purchase deleted successfully",
        affectedRows: procedureResult.affectedRows,
      });
    }

    // If we reach here, it means the deletion was not successful
    return res.status(404).json({
      success: false,
      error: procedureResult.error || "Purchase deleted  unauthorized",
    });
  } catch (error) {
    console.error("Database error:", error);
    return res.status(500).json({
      success: false,
      error: "Database operation failed",
      details: error.message,
    });
  }
});

// Add this to your insertLedger route
app.post("/insertledger", async (req, res) => {
  console.log("Request body:", req.body);

  const { Name, Mobile, Address, GSTIN, CustomerDetails, fLoginID, StateCode } =
    req.body;

  // Validate required fields
  if (!Name || !Mobile || !fLoginID || !CustomerDetails) {
    return res
      .status(400)
      .json({ message: "All required fields must be filled." });
  }

  try {
    const connection = await pool.getConnection();

    const sql = "CALL insertLedger(?, ?, ?, ?, ?, ?, ?)";
    const [results] = await connection.query(sql, [
      Name,
      Mobile,
      Address,
      GSTIN,
      fLoginID,
      CustomerDetails,
      StateCode,
    ]);

    connection.release();

    res.status(201).json({
      message: "Ledger data saved successfully",
      result: results,
    });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({
      message: "Failed to save Ledger data",
      error: error.message,
    });
  }
});

//getledgeritems
app.get("/getledgeritems", async (req, res) => {
  try {
    const userId = req.query.userId;

    if (!userId) {
      return res.status(400).json({ error: "Missing userId" });
    }

    // Assuming your stored procedure accepts 1 parameters: (userId)
    const query = "CALL getLedgerItem(?)";
    const params = [userId];
    //  console.log("params",params)
    const [rows] = await pool.query(query, params);
    const ledger = Array.isArray(rows) && Array.isArray(rows[0]) ? rows[0] : [];

    res.json(ledger);
    // console.log("✅ Purchase Data fetched:",  ledger);
  } catch (error) {
    console.error("❌ Error fetching purchase data:", error);
    res.status(500).json({ error: "Failed to fetch purchase data" });
  }
});

app.get("/getNameLIDtofID", async (req, res) => {
  try {
    const userId = req.query.userId;

    if (!userId) {
      return res.status(400).json({ error: "Missing userId" });
    }

    // Assuming your stored procedure accepts 1 parameters: (userId)
    const query = "CALL getNameLIDtofID(?)";
    const params = [userId];
    console.log("params", params);
    const [rows] = await pool.query(query, params);
    const ledger = Array.isArray(rows) && Array.isArray(rows[0]) ? rows[0] : [];

    res.json(ledger);
    console.log("✅ NameLIDtofID Data fetched:", ledger);
  } catch (error) {
    console.error("❌ Error fetching NameLIDtofID data:", error);
    res.status(500).json({ error: "Failed to fetch NameLIDtofID data" });
  }
});

//deleteledgeritems
app.delete("/deleteledger", async (req, res) => {
  try {
    const { fLoginID, LID } = req.body;

    if (!fLoginID || !LID) {
      return res.status(400).json({
        success: false,
        error: "Missing required parameters",
      });
    }

    const [results] = await pool.query("CALL DeleteLedger(?, ?)", [
      LID,
      fLoginID,
    ]);

    // Log results for debugging
    console.log("Stored procedure results:", results);

    // Usually, MySQL stored procedure CALL returns an array of result sets
    // If your procedure does a DELETE but returns no result set, results[0] might be undefined or empty

    // Check if procedure returned a status or affectedRows - adjust this logic to your procedure
    const procedureResult = results[0] && results[0][0] ? results[0][0] : null;

    if (procedureResult) {
      // If procedure explicitly returns a status field
      if (procedureResult.status === 1) {
        return res.json({
          success: true,
          message: procedureResult.message || "Ledger deleted successfully",
        });
      } else {
        return res.status(400).json({
          success: false,
          error: procedureResult.error || "Ledger deletion failed",
        });
      }
    }

    // If no procedureResult returned, but no error thrown, assume success
    return res.json({
      success: true,
      message: "Ledger deleted successfully",
    });
  } catch (error) {
    console.error("Database error:", error);

    let errorMessage = "Database operation failed";

    if (error.code === "ER_ROW_IS_REFERENCED_2") {
      errorMessage = "Cannot delete ledger: it is referenced in a bill";
    }

    return res.status(500).json({
      success: false,
      error: errorMessage,
      details: error.message,
    });
  }
});

//updateledgeritems
// UpdateLedger route
app.put("/updateledger", async (req, res) => {
  const {
    Name,
    Mobile,
    Address,
    GSTIN,
    CustomerDetails,
    LID,
    fLoginID,
    StateCode,
  } = req.body;

  console.log(`UpdateLedger request body:`, req.body);

  if (!Name || !Mobile || !LID || !fLoginID || !CustomerDetails) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields",
    });
  }

  try {
    console.log("Calling UpdateLedger with:", [
      Name,
      Mobile,
      Address,
      GSTIN,
      LID,
      fLoginID,
      CustomerDetails,
      StateCode,
    ]);

    const [result] = await pool.query(
      "CALL UpdateLedger(?, ?, ?, ?, ?, ?, ?,?)",
      [Name, Mobile, Address, GSTIN, LID, fLoginID, CustomerDetails, StateCode]
    );

    return res.status(200).json({
      success: true,
      message: "Ledger updated successfully",
    });
  } catch (error) {
    console.error("❌ Error in UpdateLedger:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update ledger",
      error: error.message,
    });
  }
});

//GO to ledger and pruchase Name dropdown Party
app.get("/getpartylist", async (req, res) => {
  const fLoginID = req.query.fLoginID;

  if (!fLoginID) {
    return res
      .status(400)
      .json({ success: false, message: "Missing fLoginID" });
  }

  try {
    const [rows] = await pool.query("CALL getParty(?)", [fLoginID]);
    return res.json(rows[0]); // MySQL stored procedures return an array of results
  } catch (err) {
    console.error("❌ Error fetching party list:", err);
    return res.status(500).json({ success: false, message: "Server error,Try again, Please refresh" });
  }
});

//ledgersummary
app.get("/getLedgerSummary", async (req, res) => {
  const { fLoginID, LID, fromDate, toDate } = req.query;

  if (!fLoginID || !LID || !fromDate || !toDate) {
    return res
      .status(400)
      .json({ success: false, message: "Missing parameters" });
  }

  try {
    const [rows] = await pool.query("CALL getLedgerSummary(?, ?, ?, ?)", [
      fLoginID,
      LID,
      fromDate,
      toDate,
    ]);
    return res.json(rows[0]);
  } catch (err) {
    console.error("❌ Error fetching ledger summary:", err);
    return res.status(500).json({ success: false, message: "Server error,Try again, Please refresh" });
  }
});

//GO to ledger and Bill Name dropdown Customer
app.get("/getCustomerlist", async (req, res) => {
  const fLoginID = req.query.fLoginID;

  if (!fLoginID) {
    return res
      .status(400)
      .json({ success: false, message: "Missing fLoginID" });
  }

  try {
    const [rows] = await pool.query("CALL getCustomer(?)", [fLoginID]);
    return res.json(rows[0]); // MySQL stored procedures return an array of results
  } catch (err) {
    console.error("❌ Error fetching Customer list:", err);
    return res.status(500).json({ success: false, message: "Server error Try again, Please refresh" });
  }
});

//getStocks
app.get("/getStocks", async (req, res) => {
  try {
    const userId = req.query.userId;

    if (!userId) {
      return res.status(400).json({ error: "Missing userId" });
    }

    // Assuming your stored procedure accepts 3 parameters: (userId, fromDate, toDate)
    const query = "CALL getStocks(?)";
    const params = [userId];
    //  console.log("params",params)
    const [rows] = await pool.query(query, params);
    const StocksData =
      Array.isArray(rows) && Array.isArray(rows[0]) ? rows[0] : [];

    res.json(StocksData);
    console.log("✅ stocks Data fetched:", StocksData);
  } catch (error) {
    console.error("❌ Error fetching stocks data:", error);
    res.status(500).json({ error: "Failed to fetch stocks data" });
  }
});

//insertStaff
app.post("/insertStaff", async (req, res) => {
  console.log("Request body:", req.body);

  const { StaffUserName, Password, Mobile, Address, fLoginID } = req.body;

  const requiredFields = [StaffUserName, Password, fLoginID];
  if (requiredFields.some((field) => field == null || field === "")) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    const connection = await pool.getConnection();

    const sql = "CALL insertStaff(?, ?, ?, ?, ?)";
    const [results] = await connection.query(sql, [
      StaffUserName,
      Password,
      Mobile,
      Address,
      fLoginID,
    ]);
    console.log("staff", results);

    connection.release();

    res.status(201).json({ message: "Staff data saved successfully" });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({
      message: "Failed to save Staff data",
      error: error.message,
    });
  }
});

//getStaff
app.get("/getStaff", async (req, res) => {
  try {
    const userId = req.query.userId;

    if (!userId) {
      return res.status(400).json({ error: "Missing userId" });
    }

    // Assuming your stored procedure accepts 1 parameters: (userId)
    const query = "CALL getStaff(?)";
    const params = [userId];
    //  console.log("params",params)
    const [rows] = await pool.query(query, params);
    const Staff = Array.isArray(rows) && Array.isArray(rows[0]) ? rows[0] : [];

    res.json(Staff);
    // console.log("✅ Purchase Data fetched:",  ledger);
  } catch (error) {
    console.error("❌ Error fetching purchase data:", error);
    res.status(500).json({ error: "Failed to fetch purchase data" });
  }
});
//updatestaff
app.put("/updateStaff", async (req, res) => {
  try {
    const { StaffUserName, Password, Mobile, Address, SID, fLoginID } =
      req.body;

    // Validate required fields
    if (!StaffUserName || !Password || !SID || !fLoginID) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    // Call the correct stored procedure with correct parameter order
    const [result] = await pool.query("CALL UpdateStaff(?, ?, ?, ?, ?, ?)", [
      StaffUserName,
      Password,
      Mobile,
      Address,
      fLoginID, // ✅ fLoginID goes before SID
      SID, // ✅ SID is last
    ]);

    return res.json({
      success: true,
      message: "Staff updated successfully",
    });
  } catch (error) {
    console.error("❌ Error in UpdateStaff:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update staff",
      error: error.message,
    });
  }
});
// DELETE staff by SID and fLoginID
app.delete("/deleteStaff", async (req, res) => {
  try {
    const { fLoginID, SID } = req.body;

    // Validate input
    if (!fLoginID || !SID) {
      return res.status(400).json({
        success: false,
        error: "Missing required parameters: fLoginID and SID are required.",
      });
    }

    // Call stored procedure: assumes DeleteStaff(p_SID, p_fLoginID)
    const [results] = await pool.query("CALL DeleteStaff(?, ?)", [
      SID,
      fLoginID,
    ]);

    // Depending on your stored procedure behavior, customize the check
    const deleted = results?.[0]?.affectedRows || results?.affectedRows;

    if (deleted > 0) {
      return res.json({
        success: true,
        message: "Staff deleted successfully",
      });
    }

    return res.status(404).json({
      success: false,
      error: "Staff not found or deletion unauthorized",
    });
  } catch (error) {
    console.error("❌ Error deleting staff:", error);
    return res.status(500).json({
      success: false,
      error: "Server error while deleting staff",
      details: error.message,
    });
  }
});

//StaffName to Billing
app.get("/StaffNameToBilling", async (req, res) => {
  try {
    const userId = req.query.userId;

    if (!userId) {
      return res.status(400).json({ error: "Missing userId" });
    }

    // Assuming your stored procedure accepts 1 parameters: (userId)
    const query = "CALL StaffNameToBilling(?)";
    const params = [userId];
    //  console.log("params",params)
    const [rows] = await pool.query(query, params);
    const StaffNameToBilling =
      Array.isArray(rows) && Array.isArray(rows[0]) ? rows[0] : [];

    res.json(StaffNameToBilling);
    // console.log("✅ Purchase Data fetched:",  ledger);
  } catch (error) {
    console.error("❌ Error fetching StaffNameToBilling data:", error);
    res.status(500).json({ error: "Failed to fetch StaffNameToBilling data" });
  }
});

//SatffSale
app.get("/getStaffSale", async (req, res) => {
  try {
    const userId = req.query.userId;
    const fromDate = req.query.fromDate || null;
    const toDate = req.query.toDate || null;

    if (!userId) {
      return res.status(400).json({ error: "Missing userId" });
    }

    // Assuming your stored procedure accepts 3 parameters: (userId, fromDate, toDate)
    const query = "CALL getStaffSale(?, ?, ?)";
    const params = [userId, fromDate, toDate];

    const [rows] = await pool.query(query, params);
    const StaffSale =
      Array.isArray(rows) && Array.isArray(rows[0]) ? rows[0] : [];

    res.json(StaffSale);
  } catch (error) {
    console.error("❌ Error fetching StaffSale data:", error);
    res.status(500).json({ error: "Failed to fetch StaffSale data" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

module.exports = app;

