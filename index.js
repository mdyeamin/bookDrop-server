const express = require("express");
const app = express();
const port = process.env.PORT || 8000;
const cors = require("cors");
require("dotenv").config();
app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { jwtVerify, createRemoteJWKSet } = require("jose-cjs");
const uri = process.env.MONGODB_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),
);
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer")) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  try {
    const { payload } = await jwtVerify(token, JWKS);
    req.user = payload;

    // console.log("payload", payload);
    next();
  } catch (error) {
    console.log(error);
    return res.status(401).json({
      message: error.message || "Unauthorized: Invalid or expired token",
    });
  }
};

const librarianVerify = async (req, res, next) => {
  const user = req.user;

  if (user?.role !== "librarian") {
    return res.status(403).json({ message: "Forbidden" });
  }
  console.log("userInfo", user);

  next();
};
const userVerify = async (req, res, next) => {
  const user = req.user;

  if (user?.role !== "user") {
    return res.status(403).json({ message: "Forbidden" });
  }
  console.log("userInfo", user);

  next();
};
const adminVerify = async (req, res, next) => {
  const user = req.user;

  if (user?.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }
  console.log("userInfo", user);

  next();
};

async function run() {
  try {
    const myDB = client.db("BookDrop");
    const userCollection = myDB.collection("user");
    const bookCollection = myDB.collection("books");
    const paymentCollection = myDB.collection("payments"); // user payment korar por ekhane data asbe
    const userReviewCollection = myDB.collection("reviews")
    app.get("/", (req, res) => {
      res.send("Hello World!");
    });
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    // user related api start here +*+*+*+*+*+*+*+*+**+*
    // get all users (admin)
    app.get("/api/users",  async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });
    // delete user by id (admin)
    app.delete("/api/users/:id", verifyToken, adminVerify, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);

      res.send(result);
    });
    // update user role by id (admin)
    app.patch("/api/users/:id", verifyToken, adminVerify, async (req, res) => {
      const id = req.params.id;
      const role = req.body.role;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: role,
        },
      };
      const result = await userCollection.updateOne(filter, updateDoc);

      res.send(result);
    });
    // user related api end here +*+*+*+*+*+*+*+*+**+*
    // Books related api Start here +*+*+*+*+*+*+*+*+**+*
    // post book by librarian
    app.post("/api/books", verifyToken, librarianVerify, async (req, res) => {
      const book = req.body;
      const payload = {
        ...book,
        createdAt: new Date(),
      };

      const result = await bookCollection.insertOne(payload);

      res.send(result);
    });
    // get all books by current librarian
    app.get("/api/books",  async (req, res) => {
      const userId = req.query.userid;
      const query = {};
      if (userId) {
        query.userId = userId;
      }

      const result = await bookCollection.find(query).toArray();

      res.send(result);
    });

    //delete librarian's book by id
    app.delete(
      "/api/books/:id",
      verifyToken,
      librarianVerify,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const result = await bookCollection.deleteOne(filter);

        res.send(result);
      },
    );

    // edit librarians's book by id
    app.patch(
      "/api/books/:id",
      verifyToken,
      librarianVerify,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const bookInfo = req.body;
        const updateDoc = {
          $set: {
            ...bookInfo,
            updatedAt: new Date(),
          },
        };
        const result = await bookCollection.updateOne(filter, updateDoc);

        res.send(result);
      },
    );

    // get all books for homepage (non-secure)
    // ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ
    // get all books for homepage with Search & Filter (non-secure)
    // get all books for homepage with Search & Filter & Pagination (public only)
   // Route to fetch books for the public homepage with search, filtering, and pagination
    app.get("/api/public/books", async (req, res) => {
      try {
        // Extract query parameters with default pagination values (page 1, limit 8 books per page)
        const { search, category, fee, page = 1, limit = 8 } = req.query;
        
        // Base query: Only fetch books that are approved for public viewing
        let query = { status: "approved" };

        // 1. Search Logic: Search for matches in either 'title' or 'author' (case-insensitive)
        if (search) {
          query.$or = [
            { title: { $regex: search, $options: "i" } },
            { author: { $regex: search, $options: "i" } },
          ];
        }

        // 2. Category Filter: Apply filter only if a specific category is selected
        if (category && category !== "all") {
          query.category = category;
        }

        // 3. Delivery Fee Filter: Apply advanced filtering based on price ranges
        if (fee && fee !== "all") {
          if (fee === "free") {
            // Match exactly free delivery (e.g., 0, "0", empty string, or null)
            query.deliveryFee = { $in: [0, "0", "", null] };
          } else if (fee === "low") {
            // Match delivery fee strictly greater than $0 and less than $5
            query.$expr = {
              $and: [
                { $gt: [{ $convert: { input: "$deliveryFee", to: "double", onError: 999, onNull: 999 } }, 0] },
                { $lt: [{ $convert: { input: "$deliveryFee", to: "double", onError: 999, onNull: 999 } }, 5] }
              ]
            };
          } else if (fee === "high") {
            // Match delivery fee greater than or equal to $5
            query.$expr = {
              $gte: [{ $convert: { input: "$deliveryFee", to: "double", onError: 0, onNull: 0 } }, 5]
            };
          }
        }

        // --- Pagination Logic ---
        
        // Parse strings to integers for mathematical operations
        const pageNumber = parseInt(page);
        const limitNumber = parseInt(limit);
        
        // Calculate the number of documents to skip based on the current page
        const skip = (pageNumber - 1) * limitNumber;

        // Get the total count of documents matching the filter criteria
        const totalBooks = await bookCollection.countDocuments(query);
        
        // Calculate the total number of pages required
        const totalPages = Math.ceil(totalBooks / limitNumber);

        // Fetch the exact subset of books: sorted by newest, skipping previous pages, and limiting the output
        const books = await bookCollection
          .find(query)
          .sort({ _id: -1 })
          .skip(skip)
          .limit(limitNumber)
          .toArray();
        
        // Send the paginated response object back to the client
        res.send({ books, totalPages, currentPage: pageNumber });
      } catch (error) {
        console.error("Error fetching public books:", error);
        res.status(500).send({ message: "Failed to fetch books" });
      }
    });
    // ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ

    // get single book by id (for details page)
    app.get("/api/public/books/:id", async (req, res) => {
      const id = req.params.id;
      const filter = {
        _id: new ObjectId(id),
      };
      const result = await bookCollection.findOne(filter);
      res.send(result);
    });

    // edit librarians's book by id

    // app.patch("/api/books/:id",verifyToken,librarianVerify, async (req, res) => {
    //       const id = req.params.id;
    //       const status = req.body.status;
    //       const filter = { _id: new ObjectId(id) };
    //       const updateDoc = {
    //         $set: {
    //           status: "unpublish",
    //         },
    //       };
    //       const result = await bookCollection.updateOne(filter, updateDoc);

    //       res.send(result);
    //     });

    // manage books by admin *************
    //                       *************

    // update user ordered books status by book id ( only admin can change status)
    app.patch(
      "/api/admin/books/:id",
      verifyToken,
      adminVerify,
      async (req, res) => {
        const id = req.params.id;
        const bookInfo = req.body;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            ...bookInfo,
            updatedAt: new Date(),
          },
        };
        const result = await bookCollection.updateOne(filter, updateDoc);

        res.send(result);
      },
    );

    // admin can delete books
    app.delete(
      "/api/admin/books/:id",
      verifyToken,
      adminVerify,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const result = await bookCollection.deleteOne(filter);

        res.send(result);
      },
    );

    // Books related api end here +*+*+*+*+*+*+*+*+**+*
    // Payment related api start here +*+*+*+*+*+*+*+*+**+*
    app.post("/api/payment", async (req, res) => {
      const order = req.body;
      const filter = { sessionId: order?.sessionId };
      const isExist = await paymentCollection.findOne(filter);

      if (isExist) {
        return res.send({ message: "already exist" });
      }
      const payload = {
        ...order,
        OrderAt: new Date(),
      };
      const result = await paymentCollection.insertOne(payload);

      res.send(result);
    });





    // Payment related api end here +*+*+*+*+*+*+*+*+**+*

// Librarian Orders API (Dashboard) start++++++++++++++++++++



app.get("/api/librarian/orders", verifyToken, librarianVerify, async (req, res) => {
      try {
        const librarianId = req.query.librarianid;

        if (!librarianId) {
          return res.status(400).send({ message: "Librarian ID is required" });
        }

        const result = await paymentCollection.aggregate([
          
          {
            $addFields: {
              productObjectId: { $toObjectId: "$productId" },
              buyerObjectId: { $toObjectId: "$userId" } 
            }
          },
          
          {
            $lookup: {
              from: "books",
              localField: "productObjectId",
              foreignField: "_id",
              as: "bookDetails"
            }
          },
         
          {
            $unwind: "$bookDetails"
          },
          
          {
            $match: {
              "bookDetails.userId": librarianId
            }
          },
          
          {
            $lookup: {
              from: "user",
              localField: "buyerObjectId",
              foreignField: "_id",
              as: "buyerDetails"
            }
          },
          
          {
            $unwind: {
              path: "$buyerDetails",
              preserveNullAndEmptyArrays: true
            }
          },
         
          {
            $sort: { _id: -1 }
          }
        ]).toArray();

        res.send(result);
      } catch (error) {
        console.error("Error fetching librarian orders:", error);
        res.status(500).send({ message: "Failed to fetch orders" });
      }
    });
    // update order status by librarianVerify


    // admin all order can see
    // Get ALL orders for Admin Dashboard
    app.get("/api/admin/orders", verifyToken, adminVerify, async (req, res) => {
      try {
        const result = await paymentCollection.aggregate([
         
          {
            $addFields: {
              productObjectId: { $toObjectId: "$productId" },
              buyerObjectId: { $toObjectId: "$userId" }
            }
          },
          
          {
            $lookup: {
              from: "books",
              localField: "productObjectId",
              foreignField: "_id",
              as: "bookDetails"
            }
          },
          {
            $unwind: "$bookDetails"
          },
          
          {
            $addFields: {
              librarianObjectId: { $toObjectId: "$bookDetails.userId" } 
            }
          },
          
          {
            $lookup: {
              from: "user", 
              localField: "librarianObjectId",
              foreignField: "_id",
              as: "librarianDetails"
            }
          },
          {
            $unwind: { path: "$librarianDetails", preserveNullAndEmptyArrays: true }
          },
          
          {
            $lookup: {
              from: "user",
              localField: "buyerObjectId",
              foreignField: "_id",
              as: "buyerDetails"
            }
          },
          {
            $unwind: {
              path: "$buyerDetails",
              preserveNullAndEmptyArrays: true
            }
          },
          
          {
            $sort: { _id: -1 }
          }
        ]).toArray();

        res.send(result);
      } catch (error) {
        console.error("Error fetching admin orders:", error);
        res.status(500).send({ message: "Failed to fetch all orders" });
      }
    });
    
    // Update order status by Librarian
    app.patch("/api/librarian/orders/:id", verifyToken, librarianVerify, async (req, res) => {
      try {
        const id = req.params.id;
        const updatedData = req.body;

        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            ...updatedData,
            updatedAt: new Date(), 
          },
        };

        const result = await paymentCollection.updateOne(filter, updateDoc);
        console.log(result);
        
        res.send(result);
      } catch (error) {
        console.error("Error updating order status:", error);
        res.status(500).send({ message: "Failed to update order status" });
      }
    });
// Librarian Orders API (Dashboard) end++++++++++++++++++++





    // Booking delivery related api start here +*+*+*+*+*+*+*+*+**+*
    // Booking delivery related api start here +*+*+*+*+*+*+*+*+**+*
    app.get("/api/my/order", async (req, res) => {
      try {
        const userId = req.query.userid;

        const matchStage = userId ? { userId: userId } : {};

        const result = await paymentCollection
          .aggregate([
            {
              $match: matchStage,
            },

            {
              $addFields: {
                productObjectId: { $toObjectId: "$productId" },
              },
            },

            {
              $lookup: {
                from: "books",
                localField: "productObjectId",
                foreignField: "_id",
                as: "bookDetails",
              },
            },

            {
              $unwind: {
                path: "$bookDetails",
                preserveNullAndEmptyArrays: true,
              },
            },

            {
              $sort: { _id: -1 },
            },
          ])
          .toArray();

        res.send(result);
      } catch (error) {
        console.error("Error fetching user orders:", error);
        res.status(500).send({ message: "Failed to fetch orders" });
      }
    });
    // Booking related delivery api end here +*+*+*+*+*+*+*+*+**+*
    
// user review section api start (((((((((((((((((((((())))))))))))))))))))))
    //user review get api
    app.get ('/api/user/review',  async(req,res)=>{
      const result = await userReviewCollection.find().toArray()
      res.send(result)
    })
    //user review post api
    app.post('/api/user/review', verifyToken, async(req,res)=>{
      const body = req.body
      const payload = {
        ...body,
        createdAt: new Date()
      }
      const result = await userReviewCollection.insertOne(payload)
      
      res.send(result)
    })
    //user review delete api
    app.delete('/api/user/review/:id',verifyToken, async(req,res)=>{
      const id = req.params.id
      const filter = {_id : new ObjectId(id)}
      const result = await userReviewCollection.deleteOne(filter)
      
      
      res.send(result) 
    })
    //user review update api
     app.patch("/api/user/review/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const reviewData = req.body
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          ...reviewData,
          updatedAt : new Date()
        },
      };
      const result = await userReviewCollection.updateOne(filter, updateDoc);
      console.log('after edit review backend',result);

      res.send(result);
    });
  


// user review section api end (((((((((((((((((((((())))))))))))))))))))))



    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
run().catch(console.dir);