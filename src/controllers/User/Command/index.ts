import { Login } from './Login';
import { Register } from './Register';
import { RefreshAccessToken } from './RefreshAccessToken';
import { Logout } from './Logout';
import { GetUser } from './GetUser';
import { GetUserById } from './GetUserById';
import { GetUsers } from './GetUsers';
import { UpdateUser } from './UpdateUser';

export const userCommands = {
    login: Login,
    register: Register,
    refreshAccessToken: RefreshAccessToken,
    logout: Logout,
    getUser: GetUser,
    getUserById: GetUserById,
    getUsers: GetUsers,
    updateUser: UpdateUser,
};
