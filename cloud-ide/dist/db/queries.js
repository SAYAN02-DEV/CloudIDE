"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteProject = exports.updateProject = exports.createProject = exports.getProjectById = exports.getProjectsByUserId = exports.verifyPassword = exports.createUser = exports.getUserById = exports.getUserByEmail = exports.getUserByUsername = void 0;
const schema_1 = require("./schema");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
// User queries
const getUserByUsername = async (username) => {
    return await schema_1.User.findOne({ username });
};
exports.getUserByUsername = getUserByUsername;
const getUserByEmail = async (email) => {
    return await schema_1.User.findOne({ email });
};
exports.getUserByEmail = getUserByEmail;
const getUserById = async (id) => {
    return await schema_1.User.findById(id);
};
exports.getUserById = getUserById;
const createUser = async (username, email, password) => {
    // Hash password before saving
    const hashedPassword = await bcryptjs_1.default.hash(password, 10);
    const user = new schema_1.User({
        username,
        email,
        password: hashedPassword,
    });
    return await user.save();
};
exports.createUser = createUser;
const verifyPassword = async (plainPassword, hashedPassword) => {
    return await bcryptjs_1.default.compare(plainPassword, hashedPassword);
};
exports.verifyPassword = verifyPassword;
// Project queries
const getProjectsByUserId = async (userId) => {
    return await schema_1.Project.find({ userId }).sort({ updatedAt: -1 });
};
exports.getProjectsByUserId = getProjectsByUserId;
const getProjectById = async (id) => {
    return await schema_1.Project.findById(id);
};
exports.getProjectById = getProjectById;
const createProject = async (name, userId, description, stack, language) => {
    const project = new schema_1.Project({
        name,
        userId,
        description,
        stack,
        language,
    });
    return await project.save();
};
exports.createProject = createProject;
const updateProject = async (id, updates) => {
    return await schema_1.Project.findByIdAndUpdate(id, updates, { new: true });
};
exports.updateProject = updateProject;
const deleteProject = async (id) => {
    await schema_1.Project.findByIdAndDelete(id);
};
exports.deleteProject = deleteProject;
