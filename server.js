const express = require("express");
const mongoose = require("mongoose")
const cors = require("cors")
require("dotenv").config()

const app = express();
app.use(cors());
app.use(express.json({limit: '50mb'}));
app.use(cors())

const connect_string = process.env.MONGODB;
const dataSchema = new mongoose.Schema({
    name: {
        required: true,
        type: String
    },
    description: {
        required: true,
        type: String
    },
    start: {
        required: true,
        type: String
    },
    end: {
        required: true,
        type: String
    },
    backgroundCover:{
        type: String
    },
    link:{
        required: true,
        type: Array
    },
    action:{
        required: true,
        type: String
    },
    perform:{
        required: true,
        type: Boolean
    },
    timezone:{
        type:String,
    },
    amount:{
        required: true,
        type: String
    },
    userCreated:{
        required: true,
        type: String
    }

})
const actionSchema = new mongoose.Schema({
    contentId:{
        required: true,
        type: String
    },
    action:{
        required: true,
        type: String
    },
    userCreated:{
        required: true,
        type: String
    },
})
const Model = mongoose.model('Data', dataSchema)
const actionModel = mongoose.model('actionData', actionSchema)
mongoose.connect(connect_string)
const database = mongoose.connection

database.on('error', (error) => {
    console.log(error)
})

database.once('connected', () => {
    console.log('Database Connected');
})

app.get("/api/dropauth/getData",async(req,res)=>{
    const data = await Model.find();
    res.json(data)
})

app.post("/api/dropauth/postData",async(req,res,next)=>{
    const data = new Model({
        name: req.body.name,
        description: req.body.description,
        start: req.body.start,
        end: req.body.end,
        backgroundCover:req.body.backgroundCover,
        action:req.body.action,
        perform:req.body.perform,
        userCreated:req.body.userCreated,
        link: req.body.link,
        timezone: req.body.timezone,
        amount: req.body.amount
    }) 
    try{
        const dataToSave = await data.save();
        res.status(200).json(dataToSave)
    }
    catch(error){
        res.status(400).json({message: error.message})
    }
})

app.post("/api/dropauth/postAction",async(req,res,next)=>{
    const data = new actionModel({
        contentId:req.body.id,
        action:req.body.action,
        userCreated:req.body.userCreated,
    }) 
    try{
        const dataToSave = await data.save();
        res.status(200).json(dataToSave)
    }
    catch(error){
        res.status(400).json({message: error.message})
    }
})

app.listen(8080,()=>{
    console.log(`Server Started at ${8080}`)
})