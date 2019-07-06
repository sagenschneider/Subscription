import { AuthenticationService } from './authentication.service'
import { TestBed } from '@angular/core/testing'
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing'
import { HttpClient, HttpErrorResponse } from '@angular/common/http'
import { AuthService, SocialUser } from 'angularx-social-login'
import { InitialiseService } from './initialise.service'
import { Initialisation, formatDate } from './server-api.service'
import { of, BehaviorSubject } from 'rxjs'
import { concatFMap } from './rxjs.util'
import { catchError, concatAll } from 'rxjs/operators'
import * as moment from 'moment'

describe( 'AuthenticationService', () => {

    let service: AuthenticationService

    let initialisationServiceSpy: any
    let authServiceMock: any
    let httpClient: HttpClient
    let httpTestingController: HttpTestingController
    let readyState = new BehaviorSubject<[string]>( null )
    let authState = new BehaviorSubject<SocialUser>( null )

    beforeEach(() => {
        initialisationServiceSpy = jasmine.createSpyObj( 'InitialiseService', ['initialisation'] )
        authServiceMock = {
            readyState: readyState,
            authState: authState
        }
        localStorage.removeItem( "accessToken" )

        TestBed.configureTestingModule( {
            imports: [HttpClientTestingModule],
            providers: [
                { provide: InitialiseService, useValue: initialisationServiceSpy },
                { provide: AuthService, useValue: authServiceMock },
            ]
        } )

        httpClient = TestBed.get( HttpClient )
        httpTestingController = TestBed.get( HttpTestingController )

        service = TestBed.get( AuthenticationService )

        removeItemFromLocalStorage( AuthenticationService.REFRESH_TOKEN )
        removeItemFromLocalStorage( AuthenticationService.REFRESH_EXPIRE )
        removeItemFromLocalStorage( AuthenticationService.ACCESS_TOKEN )
        removeItemFromLocalStorage( AuthenticationService.ACCESS_EXPIRE )

    } )

    afterEach(() => httpTestingController.verify() )

    function removeItemFromLocalStorage( key: string ) {
        localStorage.removeItem( key )
        waitUntil( ' removing storage of ' + key, () => localStorage.getItem( key ) === null )
    }

    function setItemInLocalStorage( key: string, value: string ) {
        localStorage.setItem( key, value )
        waitUntil( ' setting ' + key + '=' + value, () => localStorage.getItem( key ) === value )
    }

    function waitUntil( message: string, predicate: () => boolean, timeout: moment.Moment = moment().add( 1, 'second' ) ): void {
        while ( !predicate() ) {
            if ( moment().isAfter( timeout ) ) {
                throw Error( 'Timed out waiting on ' + message )
            }
        }
    }

    function newInitialisation( isAuthenticationRequired: boolean = true ): Initialisation {
        return {
            isAuthenticationRequired: isAuthenticationRequired,
            googleClientId: 'MOCK_GOOGLE_CLIENT_ID',
            paypalClientId: 'MOCK_PAYPAL_CLIENT_ID',
            paypalCurrency: 'MOCK_PAYPAL_CURRENCY',
        }
    }

    it( 'should create', () => expect( service ).toBeTruthy() )

    it( 'no authentication required', ( done: DoneFn ) => {
        const initialisation = newInitialisation( false )
        initialisationServiceSpy.initialisation.and.returnValue( of( initialisation ) )
        service.initialise().pipe(
            concatFMap(( init: Initialisation ) => {
                expect( init ).toEqual( initialisation )
                return service.readyState()
            } ),
            concatFMap(( isReady: boolean ) => {
                expect( isReady ).toEqual( true, 'Should be ready' )
                return service.authenticationState()
            } ),
        ).subscribe(( user: SocialUser ) => {
            expect( user ).toBeTruthy()
            expect( user.name ).toEqual( 'No Authentication' )
            done()
        }, fail )
    } )

    it( 'should be ready', ( done: DoneFn ) => {
        initialisationServiceSpy.initialisation.and.returnValue( of( newInitialisation() ) )
        readyState.next( ['GOOGLE'] )
        authState.next( null )
        service.initialise().pipe(
            concatFMap(( init ) => service.readyState() ),
        ).subscribe(( isReady: boolean ) => {
            expect( isReady ).toBeTruthy( 'Should be ready' )
            done()
        }, fail )
    } )

    it( 'not authenticated', ( done: DoneFn ) => {
        initialisationServiceSpy.initialisation.and.returnValue( of( newInitialisation() ) )
        readyState.next( ['GOOGLE'] )
        authState.next( null )
        service.initialise().pipe(
            concatFMap(( init ) => service.authenticationState() ),
        ).subscribe(( user: SocialUser ) => {
            expect( user ).toBeNull( 'Should not be logged in' )
            done()
        }, fail )
    } )

    it( 'authenticated', ( done: DoneFn ) => {
        const user = new SocialUser()
        initialisationServiceSpy.initialisation.and.returnValue( of( newInitialisation() ) )
        readyState.next( ['GOOGLE'] )
        authState.next( user )
        service.initialise().pipe(
            concatFMap(( init ) => service.authenticationState() ),
        ).subscribe(( authUser: SocialUser ) => {
            expect( authUser ).toEqual( user, 'Should be logged in' )
            expect( service.getAccessToken() ).toEqual( 'MOCK_ACCESS_TOKEN' )
            done()
        }, fail )
        const req = httpTestingController.expectOne( "/authenticate" )
        expect( req.request.method ).toEqual( 'POST' )
        req.flush( {
            accessToken: 'MOCK_ACCESS_TOKEN',
            refreshToken: 'MOCK_REFRESH_TOKEN'
        } )
    } )

    it( 'cached authentication', ( done: DoneFn ) => {
        setItemInLocalStorage( AuthenticationService.REFRESH_EXPIRE, formatDate( moment().add( 8, 'hours' ) ) )
        setItemInLocalStorage( AuthenticationService.REFRESH_TOKEN, 'MOCK_REFRESH_TOKEN' )
        initialisationServiceSpy.initialisation.and.returnValue( of( newInitialisation() ) )
        readyState.next( ['GOOGLE'] )
        const user = new SocialUser()
        authState.next( user )
        service.initialise().pipe(
            concatFMap(( init ) => service.authenticationState() ),
        ).subscribe(( authUser: SocialUser ) => {
            expect( authUser ).toEqual( user, 'Should be logged in' )
            done()
        }, fail )
    } )

    it( 'expired cached authentication', ( done: DoneFn ) => {
        setItemInLocalStorage( AuthenticationService.REFRESH_TOKEN, 'MOCK_REFRESH_TOKEN' )
        setItemInLocalStorage( AuthenticationService.REFRESH_EXPIRE, formatDate( moment().subtract( 1, 'minute' ) ) )
        const user = new SocialUser()
        initialisationServiceSpy.initialisation.and.returnValue( of( newInitialisation() ) )
        readyState.next( ['GOOGLE'] )
        authState.next( user )
        service.initialise().pipe(
            concatFMap(( init ) => service.authenticationState() ),
        ).subscribe(( authUser: SocialUser ) => {
            expect( authUser ).toEqual( user, 'Should be logged in' )
            done()
        }, fail )
        const req = httpTestingController.expectOne( "/authenticate" )
        expect( req.request.method ).toEqual( 'POST' )
        req.flush( {
            accessToken: 'MOCK_ACCESS_TOKEN',
            refreshToken: 'MOCK_REFRESH_TOKEN'
        } )
    } )

    it( 'authentication error', ( done: DoneFn ) => {
        initialisationServiceSpy.initialisation.and.returnValue( of( newInitialisation() ) )
        readyState.next( ['GOOGLE'] )
        authState.next( new SocialUser() )
        service.initialise().pipe(
            catchError(( init ) => service.authenticationState() )
        ).subscribe(( authUser ) => {
            expect( authUser ).toBeNull()
            expect( service.getAccessToken() ).toBeNull()
            done()
        } )
        const req = httpTestingController.expectOne( "/authenticate" )
        expect( req.request.method ).toEqual( 'POST' )
        req.flush( 'failed', { status: 500, statusText: 'Server failure' } )
    } )

} )