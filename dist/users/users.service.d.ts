import { Repository } from 'typeorm';
import { UserEntity } from './entities/user.entity';
export declare class UsersService {
    private readonly usersRepository;
    constructor(usersRepository: Repository<UserEntity>);
    findByUsername(username: string): Promise<UserEntity | null>;
    create(username: string, hashedPassword: string): Promise<UserEntity>;
}
