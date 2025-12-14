import { User, Project, IUser, IProject } from './schema';
import bcrypt from 'bcryptjs';

// User queries
export const getUserByUsername = async (username: string): Promise<IUser | null> => {
  return await User.findOne({ username });
};

export const getUserByEmail = async (email: string): Promise<IUser | null> => {
  return await User.findOne({ email });
};

export const getUserById = async (id: string): Promise<IUser | null> => {
  return await User.findById(id);
};

export const createUser = async (username: string, email: string, password: string): Promise<IUser> => {
  // Hash password before saving
  const hashedPassword = await bcrypt.hash(password, 10);
  
  const user = new User({
    username,
    email,
    password: hashedPassword,
  });
  
  return await user.save();
};

export const verifyPassword = async (plainPassword: string, hashedPassword: string): Promise<boolean> => {
  return await bcrypt.compare(plainPassword, hashedPassword);
};

// Project queries
export const getProjectsByUserId = async (userId: string): Promise<IProject[]> => {
  return await Project.find({ userId }).sort({ updatedAt: -1 });
};

export const getProjectById = async (id: string): Promise<IProject | null> => {
  return await Project.findById(id);
};

export const createProject = async (
  name: string,
  userId: string,
  description?: string,
  stack?: string,
  language?: string
): Promise<IProject> => {
  const project = new Project({
    name,
    userId,
    description,
    stack,
    language,
  });
  
  return await project.save();
};

export const updateProject = async (
  id: string,
  updates: Partial<IProject>
): Promise<IProject | null> => {
  return await Project.findByIdAndUpdate(id, updates, { new: true });
};

export const deleteProject = async (id: string): Promise<void> => {
  await Project.findByIdAndDelete(id);
};

