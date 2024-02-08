import { bcryptAdapter, envs } from "../../config";
import { UserModel } from "../../data";
import { CustomError, LoginUserDto, RegisterUserDto, UserEntity } from "../../domain";
import { JwtAdapter } from '../../config/jwt.adapter';
import { EmailService } from "./email.service";



export class AuthService {

    //DI
    constructor(

        private readonly emailService: EmailService
    ){}

    public async registerUser( registerUserDto: RegisterUserDto){

        const existUser = await UserModel.findOne({ email: registerUserDto.email });
        
        if( existUser ) throw CustomError.badRequest('Email already exist');

        try {

            const user = new UserModel(registerUserDto);
            
            // Encriptar contrasña
            user.password = bcryptAdapter.hash( registerUserDto.password );

            await user.save();
            //Generar JWT para mantener la autenticacion del usuario
            const token = await JwtAdapter.generateToken({ id:user.id });
            if ( !token ) throw CustomError.internalServer('Error while creating JWT');

            // Email de confirmacion
            await this.sendEmailValidationLink( user.email );

            const { password, ...userEntity } = UserEntity.fromObject(user);
            
            return {
                user: userEntity,
                token: token,
            };
        } catch (error) {
            throw CustomError.internalServer(`${error}`)
        }
    }

    public async loginUser( loginUserDto: LoginUserDto){

        // findone para verificar si existe
        const user = await UserModel.findOne({ email: loginUserDto.email });
        if( !user ) throw CustomError.badRequest('Email not exist');

        // is match... bcryp...compare(123)
        const isMatching = bcryptAdapter.compare( loginUserDto.password, user.password);
        if ( !isMatching ) throw CustomError.badRequest('Password is not valid');

        const { password, ...userEntity } = UserEntity.fromObject( user );

        const token = await JwtAdapter.generateToken({ id:user.id });
        if ( !token ) throw CustomError.internalServer('Error while creating JWT');

        return {
            user: userEntity,
            token: token,
        }
    }

    private sendEmailValidationLink = async( email:string ) => {

        const token = await JwtAdapter.generateToken({email});
        if( !token ) throw CustomError.internalServer('Error gettin token');

        const link = `${ envs.WEBSERVICE_URL }/auth/validate-email/${ token }`;
        const html = `
            <h1>Validate your email</h1>
            <p>Click on the following link to validate your email</p>
            <a href="${ link }">Validate your email: ${ email }</a>
        `;

        const options = {
            to: email,
            subject: 'Validate your email',
            htmlBody: html,
        }

        const isSet = await this.emailService.sendEmail(options);
        if( !isSet ) throw CustomError.internalServer('Error sending email');

        return true;

    }

    public validateEmail = async(token:string) => {

        const payload = await JwtAdapter.validateToken(token);
        if (!payload ) throw CustomError.unauthorized('Invalid token');

        const { email } = payload as {email:string};
        if (!email) throw CustomError.internalServer('Email not in token');

        const user = await UserModel.findOne({ email });
        if (!user) throw CustomError.internalServer('Email not exist');

        user.emailValidated = true;
        await user.save();

        return true;


    }

}