import {Injectable} from '@angular/core';
import {Subject} from 'rxjs/Subject';
import {HttpClient, HttpHeaders, HttpErrorResponse} from "@angular/common/http";
import {EnvProp} from "../../shared/env-prop";
import {ToastrService} from "ngx-toastr";
import {TranslationService} from "angular-l10n";
import {Router} from "@angular/router";


export class HouseContact {
    constructor(public title: string,
                public name: string,
                public phone: string,
                public email: string,
                public showOrder: number,) {
        this.title = title;
        this.name = name;
        this.phone = phone;
        this.email = email;
        this.showOrder = showOrder;
    }
}

export class House {
    constructor(public id: string,
                public address: string,
                public title: string,
                public img: string,
                public head: HouseContact,
                public contacts: Array<HouseContact>,
                public welcomePhrase: string,
                public description: string,
                public egrpou: string,
                public porchCount: number,
                public stageCount: number,
                public apartmentCount: number) {
        this.id = id;
        this.address = address;
        this.title = title;
        this.img = img;
        this.head = head;
        this.contacts = contacts;
        this.welcomePhrase = welcomePhrase;
        this.description = description;
        this.egrpou = egrpou;
        this.porchCount = porchCount;
        this.stageCount = stageCount;
        this.apartmentCount = apartmentCount;
    }
}


@Injectable()
export class HousesService {

    private houses: Array<House> = [];
    public housesChanged = new Subject<House[]>();
    public passContacts = new Subject<HouseContact[]>();
    public passDescription = new Subject<String>();
    public passUserIsHead = new Subject<Boolean>();

    private housesMap: object = {};
    private housesIndexs: object = {};

    private currentHouse: House;
    public userIsHead: boolean;

    constructor(private http: HttpClient,
                private envProp: EnvProp,
                public translation: TranslationService,
                private toastr: ToastrService,
                private router: Router) {
    }

    resolve() {
        console.log("resolving houses on load>>");
        return this.getHousesFromBackEnd();
    }

    public async getHousesFromBackEnd() {
        console.log("try get houses  >>: ");

        this.clearHousesInService();

        let result = await this.http.post(
            this.envProp.ROOT_URL,
            {},
            {
                headers: new HttpHeaders()
                    .set('Content-Type', 'application/json')
                    .set('Method-Name', 'house.get'),
                responseType: 'json'
            })
            .toPromise()
            .then(response => {
                console.log('houses ', response);
                if (response && response['data']) {
                    return response['data'];
                } else {
                    this.toastr.error(response['error'], "загрузка домов");
                    return [];
                }
            })
            .catch((err: HttpErrorResponse) => {
                if (err.error instanceof Error) {
                    console.log('Client-side error occured.');
                } else {
                    console.log('Server-side error occured.');
                }
                this.toastr.error(err.error.error.description, " загрузка домов");
                return [];
            });


        for (let house in result) {
            if (!this.housesMap[result[house]['title']]) {
                this.houses.push(result[house]);
            } else {
                this.houses[this.housesIndexs[result[house]['title']]] = result[house];
            }
        }

        this.housesChanged.next(this.houses.slice(0));


        this.houses.forEach((house, index) => {
            this.housesMap[house.title] = house.id;
            this.housesIndexs[house.title] = index;
        });


    }

    public async searchHouse(search) {
        console.log("try search houses  >>: ");

        let result = await this.http.post(
            this.envProp.ROOT_URL,
            search,
            {
                headers: new HttpHeaders()
                    .set('Content-Type', 'application/json')
                    .set('Method-Name', 'house.find'),
                responseType: 'json'
            })
            .toPromise()
            .then(response => {
                console.log('houses ', response);
                if (response && response['data']) {
                    this.toastr.success(`${this.translation.translate('General.found')} ${response['data'].length}`,
                        `${this.translation.translate('General.searchingHouse')}`);
                    return response['data'];
                } else {
                    this.toastr.error(response['error'], `${this.translation.translate('General.searchingHouse')}`);
                    return [];
                }
            })
            .catch((err: HttpErrorResponse) => {
                if (err.error instanceof Error) {
                    console.log('Client-side error occured.');
                } else {
                    console.log('Server-side error occured.');
                }
                this.toastr.error(err.error.error.description, `${this.translation.translate('General.searchingHouse')}`);
                return [];
            });

        return result;

    }

    public async getAvailableForJoinApartments(id: string) {
        console.log("try get Available For Join Aparments  >>: ");

        let result = await this.http.post(
            this.envProp.ROOT_URL,
            {
                'houseId': [id],
                'apartmentType': 'empty'
            },
            {
                headers: new HttpHeaders()
                    .set('Content-Type', 'application/json')
                    .set('Method-Name', 'apartment.getHouseApartments'),
                responseType: 'json'
            })
            .toPromise()
            .then(response => {
                console.log('empty HouseApartments ', response);
                if (response && response['data']) {
                    return response['data'][id]['apartments'];
                } else {
                    this.toastr.error(response['error'], `${this.translation.translate('General.gettingEmptyApartments')}`);
                    return [];
                }
            })
            .catch((err: HttpErrorResponse) => {
                if (err.error instanceof Error) {
                    console.log('Client-side error occured.');
                } else {
                    console.log('Server-side error occured.');
                }
                this.toastr.error(err.error.error.description, `${this.translation.translate('General.gettingEmptyApartments')}`);
                return [];
            });

        return result;
    }

    public async joinHouse(joinHouseRequest) {
        console.log("try join house  >>: ");

        let result = await this.http.post(
            this.envProp.ROOT_URL,
            joinHouseRequest,
            {
                headers: new HttpHeaders()
                    .set('Content-Type', 'application/json')
                    .set('Method-Name', 'apartmentJoinBid.new'),
                responseType: 'json'
            })
            .toPromise()
            .then(response => {
                console.log('response ', response);
                if (response && response['data']) {
                    this.toastr.success(`${this.translation.translate('General.success')}`,
                        `${this.translation.translate('General.joiningApartment')}`);
                    return response['data'];
                } else {
                    this.toastr.error(response['error']['description'], `${this.translation.translate('General.joiningApartment')}`);
                    return {'error': response['error']};
                }
            })
            .catch((err: HttpErrorResponse) => {
                if (err.error instanceof Error) {
                    console.log('Client-side error occured.');
                } else {
                    console.log('Server-side error occured.');
                }
                this.toastr.error(err.error.error.description, `${this.translation.translate('General.joiningApartment')}`);
                return {'error': err['error']};
            });

        return result;

    }

    public getHouses() {
        if (Array.isArray(this.houses)) {
            return this.houses.slice();
        }
        else {
            return [];
        }
    }

    public getCurrentHouse() {
        return Object.assign({}, this.currentHouse);
    }

    public defineAmICurrentHouseHead(accountID: string) {
        if (this.currentHouse.head['headID'] === accountID) {
            this.userIsHead = true;
        } else {
            this.userIsHead = false;
        }
    }

    public getCurrentHouseID() {
        if (this.currentHouse) {
            return this.currentHouse.id;
        }
    }

    public passCurrentHouseContacts() {
        if (this.currentHouse && this.currentHouse.contacts) {
            this.passContacts.next(this.currentHouse.contacts.map(item => ({...item})));
        }
    }

    public passCurrentHouseDescription() {
        if (this.currentHouse) {
            let temp = this.currentHouse.description;
            this.passDescription.next(temp);
        }
    }

    public passCurrentHouseUserIsHead() {
        if (this.userIsHead) {
            this.passUserIsHead.next(this.userIsHead);
        }
    }

    public async editHouseInfo(info: Object) {

        info['houseId'] = this.currentHouse.id;

        console.log("try edit houseInfo with  >>: ", info);

        let result = await this.http.post(
            this.envProp.ROOT_URL,
            info,
            {
                headers: new HttpHeaders()
                    .set('Content-Type', 'application/json')
                    .set('Method-Name', 'house.update'),
                responseType: 'json'
            })
            .toPromise()
            .then(response => {
                console.log('resp ', response);
                if (response && response['data']) {
                    this.toastr.success(`${this.translation.translate('General.success')}`, `${this.translation.translate('General.editingHouseInfo')}`);

                    for (let key in info) {
                        this.currentHouse[key] = info[key];
                    }

                    this.passCurrentHouseContacts();

                    this.getHousesFromBackEnd();

                    return response['data'];
                } else {
                    this.toastr.error(response['error'], `${this.translation.translate('General.editingHouseInfo')}`);
                    return {'error': response['error']};
                }
            })
            .catch((err: HttpErrorResponse) => {
                if (err.error instanceof Error) {
                    console.log('Client-side error occured.');
                } else {
                    console.log('Server-side error occured.');
                }
                this.toastr.error(err.error.error.description, `${this.translation.translate('General.editingHouseInfo')}`);
                return {'error': err['error']};
            });

        return result;

    }

    public async editDescription(description: string) {
        console.log("try edit description  >>: ");

        let result = await this.http.post(
            this.envProp.ROOT_URL,
            {
                'houseId': this.currentHouse.id,
                'description': description
            },
            {
                headers: new HttpHeaders()
                    .set('Content-Type', 'application/json')
                    .set('Method-Name', 'house.update'),
                responseType: 'json'
            })
            .toPromise()
            .then(response => {
                console.log('resp ', response);
                if (response && response['data']) {
                    this.toastr.success(`${this.translation.translate('General.success')}`, `${this.translation.translate('General.editingHouseDesc')}`);

                    this.currentHouse.description = description;
                    this.passCurrentHouseDescription();
                    this.getHousesFromBackEnd();

                    return response['data'];
                } else {
                    this.toastr.error(response['error'], `${this.translation.translate('General.editingHouseDesc')}`);
                    return {'error': response['error']};
                }
            })
            .catch((err: HttpErrorResponse) => {
                if (err.error instanceof Error) {
                    console.log('Client-side error occured.');
                } else {
                    console.log('Server-side error occured.');
                }
                this.toastr.error(err.error.error.description, `${this.translation.translate('General.editingHouseDesc')}`);
                return {'error': err['error']};
            });

        return result;
    }

    public async editContacts(contacts: Array<HouseContact>) {
        console.log("try edit contacts  >>: ");

        let result = await this.http.post(
            this.envProp.ROOT_URL,
            {
                'houseID': this.currentHouse.id,
                'contacts': contacts
            },
            {
                headers: new HttpHeaders()
                    .set('Content-Type', 'application/json')
                    .set('Method-Name', 'houseContact.add'),
                responseType: 'json'
            })
            .toPromise()
            .then(response => {
                console.log('resp ', response);
                if (response && response['data']) {
                    this.toastr.success(`${this.translation.translate('General.success')}`, `${this.translation.translate('General.editingHouseContacts')}`);

                    this.currentHouse.contacts = contacts;
                    this.passCurrentHouseContacts();
                    this.getHousesFromBackEnd();

                    return response['data'];
                } else {
                    this.toastr.error(response['error'], `${this.translation.translate('General.editingHouseContacts')}`);
                    return {'error': response['error']};
                }
            })
            .catch((err: HttpErrorResponse) => {
                if (err.error instanceof Error) {
                    console.log('Client-side error occured.');
                } else {
                    console.log('Server-side error occured.');
                }
                this.toastr.error(err.error.error.description, `${this.translation.translate('General.editingHouseContacts')}`);
                return {'error': err['error']};
            });
        return result;
    }

    public async addNewHouse(house: House) {
        console.log("try add new House  >>: ", house);

        let result = await this.http.post(
            this.envProp.ROOT_URL,
            house,
            {
                headers: new HttpHeaders()
                    .set('Content-Type', 'application/json')
                    .set('Method-Name', 'house.new'),
                responseType: 'json'
            })
            .toPromise()
            .then(response => {
                console.log('resp ', response);

                if (response && response['data']) {
                    this.toastr.success(`${this.translation.translate('General.houseAdd')}`, `${this.translation.translate('General.addingHouse')}`);
                    this.getHousesFromBackEnd();
                    this.router.navigate(['myHouses']);
                    return response['data'];
                } else {
                    this.toastr.error(response['error'], `${this.translation.translate('General.addingHouse')}`);
                    return {'error': response['error']};
                }
            })
            .catch((err: HttpErrorResponse) => {
                if (err.error instanceof Error) {
                    console.log('Client-side error occured.');
                } else {
                    console.log('Server-side error occured.');
                }
                this.toastr.error(err.error.error.description, `${this.translation.translate('General.addingHouse')}`);
                return {'error': err['error']};
            });

        return result;

    }

    public async getHouseByTitleFromBackEnd(title: string) {
        console.log("try get house by title >>: ");

        let id = this.housesMap[title];

        if (typeof id !== 'undefined') {


            let result = await this.http.post(
                this.envProp.ROOT_URL,
                {
                    'fields': ['id', 'title', 'address', 'img', 'head', 'contacts'],
                    'houseID': [id]
                },
                {
                    headers: new HttpHeaders()
                        .set('Content-Type', 'application/json')
                        .set('Method-Name', 'house.get'),
                    responseType: 'json'
                })
                .toPromise()
                .then(response => {
                    console.log('house ', response);
                    if (response && response['data']) {
                        return response['data'][id];
                    } else {
                        this.toastr.error(response['error'], "отладка загрузка дома вернулась ошибка");
                        this.router.navigate(['myHouses']);
                        return {};
                    }
                })
                .catch((err: HttpErrorResponse) => {
                    if (err.error instanceof Error) {
                        console.log('Client-side error occured.');
                    } else {
                        console.log('Server-side error occured.');
                    }
                    this.toastr.error(err.error.error.description, "отладка загрузка дома httpErr");

                    return {};
                });

            this.currentHouse = result;

        } else {
            this.toastr.error(
                `${this.translation.translate('General.errors.noHousePerm')}`,
                `${this.translation.translate('General.error')}`);
            this.router.navigate(['myHouses']);
            this.currentHouse = <House>{};
        }

    }

    public async clearHousesInService() {
        this.houses = [];
        this.housesMap = {};
        this.housesIndexs = {};
    }

}
