import { Controller, Get, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { AuthGuard } from '@nestjs/passport';
import { GetUser } from '../auth/decorator';

@Controller('users')
@UseGuards(AuthGuard('jwt'))
export class UsersController {
  /*
    GET /users
    GET /users/:id
    POST /users
    PATCH /users/:id
    DELETE /users/:id
    */
    constructor(private readonly usersService: UsersService) {}

    @Get()
    findAll() {
        return this.usersService.findAll();
    }

    @Get('me')
    getMe(@GetUser('id') userId: number) {
        return this.usersService.getMe(userId);
    }
}
