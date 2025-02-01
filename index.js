const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.u51v8.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }, 
});

async function run() {
  try {
    // Connect the client to the server
    // await client.connect();
    // console.log("Connected to MongoDB");

    const db = client.db("fitnessTracker");
    const userCollection = db.collection("users");
    const trainerCollection = db.collection("trainers");
    const classCollection = db.collection("class");
    const newsletterCollection = db.collection("newsletter");
    const feedbackCollection = db.collection("feedback");
    const paymentCollection = db.collection("payments");
    const reviewCollection = db.collection("reviews");
    const forumCollection = db.collection("forums");

    // Create user API endpoint
    app.post("/users", async (req, res) => {
      try {
        const user = req.body;
        console.log("Received user data:", user); // Debug log

        // Check if user already exists
        const existingUser = await userCollection.findOne({
          email: user.email,
        });
        if (existingUser) {
          console.log("User already exists:", user.email); // Debug log
          return res.status(400).json({ message: "User already exists" });
        }

        // Insert new user
        const result = await userCollection.insertOne(user);
        console.log("User created successfully:", result); // Debug log
        res.status(201).json(result);
      } catch (error) {
        console.error("Error creating user:", error); // Debug log
        res.status(500).json({ message: error.message });
      }
    });

    // Get user by email
    app.get("/users/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const user = await userCollection.findOne({ email });
        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }
        res.json(user);
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });

    // update user profile
    app.patch("/users/:email", async (req, res) => {
      const email = req.params.email;
      const updatedUser = req.body;
      const result = await userCollection.updateOne(
        { email },
        { $set: updatedUser }
      );
      res.json(result);
    });

    // Get all trainers
    app.get("/trainers", async (req, res) => {
      try {
        const trainers = await trainerCollection
          .find({ status: "active" })
          .toArray();
        res.json(trainers);
      } catch (error) {
        console.error("Error fetching trainers:", error);
        res.status(500).json({ message: error.message });
      }
    });

    // Get single trainer details
    app.get("/trainers/:id", async (req, res) => {
      try {
        const { id } = req.params;

        // Validate ObjectId
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ 
            success: false,
            message: "Invalid trainer ID format" 
          });
        }

        const trainer = await trainerCollection.findOne({ _id: new ObjectId(id) });
        
        if (!trainer) {
          return res.status(404).json({ 
            success: false,
            message: "Trainer not found" 
          });
        }

        // Send response with proper JSON structure
        res.json({ 
          success: true,
          data: trainer 
        });

      } catch (error) {
        console.error("Error fetching trainer:", error);
        res.status(500).json({ 
          success: false,
          message: "Failed to fetch trainer details",
          error: error.message 
        });
      }
    });

    // Create trainer API endpoint
    app.post("/trainers", async (req, res) => {
      try {
        const trainer = req.body;

        // Add slot IDs to available days
        if (trainer.availableDays) {
          trainer.availableDays = trainer.availableDays.map((day) => ({
            day,
            slotId: Math.random().toString(36).substring(2, 15)
          }));
        }

        const result = await trainerCollection.insertOne(trainer);

        // Add trainer's classes to classes collection
        if (trainer.classes && trainer.classes.length > 0) {
          const classPromises = trainer.classes.map(async (className) => {
            const classData = {
              name: className,
              trainerId: result.insertedId,
              trainerName: trainer.fullName,
              description: trainer.classDescriptions?.[className] || `${className} class description`,
              intensity: ["Beginner", "Intermediate", "Advanced"],
              equipment: trainer.classEquipment?.[className] || [],
              duration: trainer.classDurations?.[className] || "60 mins",
              image: trainer.classImages?.[className] || "/default-class-image.jpg",
              specializedTrainers: [
                {
                  id: result.insertedId,
                  name: trainer.fullName,
                  experience: trainer.experience,
                  skills: trainer.skills,
                  age: trainer.age,
                  profileImage: trainer.profileImage,
                  availableDays: trainer.availableDays,
                  availableTime: trainer.availableTime,
                  socialMedia: {
                    facebook: trainer.facebook,
                    twitter: trainer.twitter,
                    instagram: trainer.instagram,
                  },
                },
              ],
            };
            return classCollection.insertOne(classData);
          });
          await Promise.all(classPromises);
        }

        res.status(201).json(result);
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });

    // delete trainer
    app.delete("/trainers/:id", async (req, res) => {
      try {
        const id = req.params.id;

        // Get trainer info before deleting
        const trainer = await trainerCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!trainer) {
          return res.status(404).json({ message: "Trainer not found" });
        }

        // Delete from trainer collection
        await trainerCollection.deleteOne({ _id: new ObjectId(id) });

        // Update user role to member in user collection
        await userCollection.updateOne(
          { email: trainer.email },
          { $set: { role: "member" } }
        );

        res.json({ message: "Trainer deleted and role updated successfully" });
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });

    // pending trainers
    app.get("/pending-trainers", async (req, res) => {
      const trainers = await trainerCollection
        .find({ status: "pending" })
        .toArray();
      res.json(trainers);
    });

    // update trainer status
    app.patch("/trainers/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const status = req.body.status;

        // Get trainer info before updating status
        const trainer = await trainerCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!trainer) {
          return res.status(404).json({ message: "Trainer not found" });
        }

        // Update trainer status
        const result = await trainerCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status } }
        );

        // If approved, update user role to trainer
        if (status === "active") {
          await userCollection.updateOne(
            { email: trainer.email },
            { $set: { role: "trainer" } }
          );
        }

        res.json({ message: "Trainer status updated successfully" });
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });

    // reject trainer
    app.patch("/trainers/:id/reject", async (req, res) => {
      try {
        const id = req.params.id;
        const feedback = req.body.feedback;

        // Get trainer info before deleting
        const trainer = await trainerCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!trainer) {
          return res.status(404).json({ message: "Trainer not found" });
        }

        // Add feedback to feedback collection
        await feedbackCollection.insertOne({
          userId: trainer._id,
          email: trainer.email,
          feedback: feedback,
          type: "trainer_rejection",
          createdAt: new Date(),
        });

        // Delete trainer application
        await trainerCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "rejected" } }
        );

        res.json({
          message: "Trainer rejected and feedback saved successfully",
        });
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });

    // get trainer by id
    app.get("/trainer/:id", async (req, res) => {
      const id = req.params.id;
      const trainer = await trainerCollection.findOne({ _id: new ObjectId(id) });
      res.json(trainer);
    });

    // get trainer by email
    app.get("/trainer-profile/:email", async (req, res) => {
      const email = req.params.email;
      const trainer = await trainerCollection.findOne({ email });
      res.json(trainer);
    });


    // get all trainers
    app.get("/all-trainers", async (req, res) => {
      const trainers = await trainerCollection
        .find({ status: "pending", status: "rejected" })
        .toArray();
      res.json(trainers);
    });

    // get trainer by id and slot id
    // app.get("/trainers/:id/:slotId", async (req, res) => {
    //   const { id, slotId } = req.params;
    //   const trainer = await trainerCollection.findOne({ _id: new ObjectId(id) });
    //   res.json(trainer);
    // });

    // get feedback by trainer id
    app.get("/feedback/:email", async (req, res) => {
      const email = req.params.email;
      const feedback = await feedbackCollection.findOne({ email });
      res.json(feedback);
    });

    // user role
    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email });
      console.log(user);
      res.json(user);
    });

    // admin login
    app.post("/admin/login", async (req, res) => {
      const email = req.body.email;
      const password = req.body.password;
      const admin = await userCollection.findOne({ email, password });
      if (admin) {
        res.json(admin);
      } else {
        res.status(401).json({ message: "Invalid credentials" });
      }
    });

    // newsletter subscribe
    app.post("/newsletter/subscribe", async (req, res) => {
      const { name, email } = req.body;
      const result = await newsletterCollection.insertOne({
        name,
        email,
        date: new Date(),
      });
      res.status(201).json(result);
    });

    // get all newsletter subscribers
    app.get("/newsletter/subscribers", async (req, res) => {
      const subscribers = await newsletterCollection.find().toArray();
      res.json(subscribers);
    });

    // get all classes
    app.get("/classes", async (req, res) => {
      const classes = await classCollection.find().toArray();
      res.json(classes);
    });

    // add class
    app.post('/classes', async (req, res) => {
        try {
          const newClass = req.body;
          const result = await classCollection.insertOne(newClass);
          
          // Send only the necessary data
          res.status(201).json({
            success: true,
            insertedId: result.insertedId,
            message: 'Class added successfully'
          });
        } catch (error) {
          console.error('Error adding class:', error);
          res.status(500).json({
            success: false,
            message: 'Error adding class',
            error: error.message
          });
        }
      });

    // Get class details and available trainers by class ID
    app.get('/classes/:id', async (req, res) => {
        try {
          const classId = req.params.id;
          
          // Get class details
          const classDetails = await classCollection.findOne({
            _id: new ObjectId(classId)
          });

          if (!classDetails) {
            return res.status(404).json({
              success: false,
              message: 'Class not found'
            });
          }

          // Get trainers for this class
          const trainers = await trainerCollection.find({
            classes: classDetails.name,
            status: 'active'
          }).toArray();

          res.json({
            success: true,
            classDetails,
            trainers
          });

        } catch (error) {
          console.error('Error fetching class details:', error);
          res.status(500).json({
            success: false,
            message: 'Error fetching class details',
            error: error.message
          });
        }
    });

    // Create payment intent
    app.post("/create-payment-intent", async (req, res) => {
      try {
        const { price, trainerId, slotId } = req.body;


        // Update trainer's availableDays with booking info
        await trainerCollection.updateOne(
          { _id: new ObjectId(trainerId), "availableDays.slotId": slotId },
          {
            $set: {
              "availableDays.$.isBooked": true,
              "availableDays.$.bookedBy": req.body.email
            }
          }
        );

        // Create a PaymentIntent with the order amount and currency
        const paymentIntent = await stripe.paymentIntents.create({
          amount: price * 100, // Convert to cents
          currency: "usd",
          payment_method_types: ['card'],
        });

        res.json({
          clientSecret: paymentIntent.client_secret
        });
      } catch (error) {
        console.error("Payment Intent Error:", error);
        res.status(500).json({ error: error.message });
      }
    });

    // get booked trainers
    app.get("/booked-trainers", async (req, res) => {
      const bookedTrainers = await paymentCollection.find().toArray();
      res.json(bookedTrainers);
    });

    // delete slot
    app.delete("/slots/:id", async (req, res) => {
      const id = req.params.id;
      const result = await trainerCollection.updateOne(
        { "availableDays.slotId": id },
        { $pull: { availableDays: { slotId: id } } }
      );
      res.json(result);
    });

    // Save payment info after successful payment
    app.post("/payments", async (req, res) => {
      try {
        const payment = req.body;
        const { price, trainerId, slotId } = req.body;

        
        // Update trainer's availableDays with booking info
        await trainerCollection.updateOne(
            { _id: new ObjectId(trainerId), "availableDays.slotId": slotId },
            {
              $set: {
                "availableDays.$.isBooked": true,
                "availableDays.$.bookedBy": payment.userEmail
              }
            }
          );

        const result = await paymentCollection.insertOne(payment);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // get all slots
    app.get("/all-slots", async (req, res) => {
      try {
        // Get all trainers with their slots
        const trainers = await trainerCollection.find().toArray();

        // Initialize array to store all slots
        let allSlots = [];

        // Iterate through each trainer
        trainers.forEach(trainer => {
          if (trainer.availableDays) {
            // Get all slots for this trainer
            trainer.availableDays.forEach((slot) => {
              // Add each slot with trainer info
              allSlots.push({
                _id: slot.slotId,
                trainerId: trainer._id,
                trainerName: trainer.name,
                trainerEmail: trainer.email,
                slotId: slot.slotId,
                day: slot.day,
                isBooked: slot.isBooked || false,
                bookedBy: slot.bookedBy || null
              });
            });
          }
        });

        console.log('All slots found:', allSlots);
        res.json(allSlots);
      } catch (error) {
        console.error('Error fetching slots:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // post review
    app.post("/reviews", async (req, res) => {
      const review = req.body;
      const result = await reviewCollection.insertOne(review);
      res.json(result);
    });

    // get all reviews
    app.get("/reviews", async (req, res) => {
      const reviews = await reviewCollection.find().toArray();
      res.json(reviews);
    });

    // get all forums
    app.get("/forums", async (req, res) => {
      const forums = await forumCollection.find().toArray();
      res.json(forums);
    });

    // get forum by id
    app.get("/forums/:id", async (req, res) => {
      const id = req.params.id;
      const forum = await forumCollection.findOne({ _id: new ObjectId(id) });
      res.json(forum);
    });

    // vote forum
    app.post("/forums/:id/vote", async (req, res) => {
      const { id } = req.params;
      const { userId, voteType } = req.body;
      const result = await forumCollection.updateOne({ _id: new ObjectId(id) }, { $inc: { [voteType]: 1 } });
      res.json(result);
    });

    // post forum
    app.post("/forums", async (req, res) => {
      const forum = req.body;
      const result = await forumCollection.insertOne(forum);
      res.json(result);
    });

    // get bookings and user stats
    app.get("/admin/dashboard-stats", async (req, res) => {
      try {
        const bookings = await paymentCollection.find().toArray();
        const subscribers = await newsletterCollection.find().toArray();
        
        res.json({
          bookings,
          stats: subscribers
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // post slot in trainer collection with trainer email
    app.post("/trainer-slots/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const { days, slotTime, classes } = req.body;

        console.log(days, slotTime, classes);
        
        // Update availableDays, availableTime and classes for the trainer
        const result = await trainerCollection.updateOne(
          { email },
          { 
            $push: {
              availableDays: { $each: days },
              classes: { $each: classes }
            },
            $set: {
              availableTime: slotTime
            }
          }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ message: "Trainer not found" });
        }

        res.json({ message: "Slot and classes updated successfully" });
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } catch (error) {
    console.error("Database connection error:", error);
  }
}

// Add error handling for the server
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Something broke!" });
});

// Start the server only after connecting to MongoDB
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Fitness Tracker Server");
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
