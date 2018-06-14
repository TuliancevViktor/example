import {Component, Inject, OnInit} from '@angular/core';
import {Language, LocaleService, TranslationService} from "angular-l10n";
import {MyNewsService, NewsItem} from "../../my-news/myNews.service";
import {HousesService} from "../houses.service";
import {Subscription} from "rxjs/Subscription";
import {BsModalRef, BsModalService} from "ngx-bootstrap";
import {ConfirmationService} from "../../../components/confirmation-popup/confirmation.service";
import {ConfirmationPopupComponent} from "../../../components/confirmation-popup/confirmation-popup.component";
import {PageScrollInstance, PageScrollService} from "ngx-page-scroll";
import {DOCUMENT} from "@angular/common";

@Component({
    selector: 'app-house-news',
    templateUrl: './house-news.component.html',
    styleUrls: ['./house-news.component.scss']
})
export class HouseNewsComponent implements OnInit {

    public pageScrollInstanceEditingArea: PageScrollInstance;

    @Language() lang: string;

    bsModalRef: BsModalRef;
    houseNews: Array<NewsItem>;
    collapsedNews: {};
    userIsHead: boolean;
    houseNewsTotalCount: number;
    houseNewsSubscription: Subscription;
    confirmationSubscription: Subscription;
    editMode: boolean = false;
    editorLanguage: string = "uk";

    editorConfig = {
        uiColor: '#d7e7f7',
        toolbar: [
            {
                name: 'clipboard',
                items: ['Cut', 'Copy', 'Paste', 'PasteText', 'PasteFromWord', '-', 'Undo', 'Redo']
            }, '/',
            {
                name: 'basicstyles',
                items: ['Bold', 'Italic', 'Underline', 'Strike', '-', 'CopyFormatting', 'RemoveFormat']
            },
            {name: 'paragraph', items: ['NumberedList', 'BulletedList', '-',]},
            {name: 'insert', items: ['Table', 'HorizontalRule', 'SpecialChar']},
            {name: 'styles', items: ['Format',]},
            {name: 'tools', items: ['Maximize']}
        ]
    };

    public newsItem: NewsItem = new NewsItem('', '', false, '', '', '', '', '', '', '', '', '');

    constructor(public locale: LocaleService,
                public newsService: MyNewsService,
                private housesService: HousesService,
                public translation: TranslationService,
                private modalService: BsModalService,
                private confirmationService: ConfirmationService,
                private pageScrollService: PageScrollService,
                @Inject(DOCUMENT) private document: any,) {
    }


    ngOnInit() {

        this.houseNews = this.newsService.getHouseNews();
        this.defineCollapsed();
        this.houseNewsTotalCount = this.newsService.getHouseNewsTotalCount();
        this.houseNewsSubscription = this.newsService.houseNewsChanged
            .subscribe(
                (houseNews: NewsItem[]) => {
                    console.log("houseNews subject did work");
                    this.houseNews = houseNews;
                    this.defineCollapsed();
                }
            );

        this.lang == 'ru' ? this.editorLanguage = 'ru' : this.editorLanguage = 'uk';

        this.confirmationSubscription = this.confirmationService.confirmationDialogAnswer
            .subscribe(
                (answer) => {
                    console.log("answer in house news component", answer);
                    if (answer) {
                        console.log(this.newsItem);
                        let result = this.newsService.deleteHouseNewsItem(this.newsItem, this.housesService.getCurrentHouseID());
                        console.log(result);
                    }
                }
            );

        this.pageScrollInstanceEditingArea = PageScrollInstance.newInstance(
            {
                document: this.document,
                scrollTarget: '#editingArea',
                pageScrollDuration: 300,
                pageScrollOffset: 150
            });

        this.userIsHead = this.housesService.userIsHead;
    }

    ngOnDestroy() {
        this.houseNewsSubscription.unsubscribe();
    }

    trackByFn(index: any, item: any) {
        return index;
    }

    public onAddNewHouseNewsItem() {
        this.editMode = true;
        this.newsItem = new NewsItem('', '', false, '', '', '', '', '', '', '', '', '');
    }

    onCancelEditMode() {
        this.editMode = false;
        this.houseNews = this.newsService.getHouseNews();
    }

    onSetEditMode(newsItem) {
        if (this.editMode) {
            let result = this.newsService.addOrEditHouseNewsItem(this.newsItem, this.housesService.getCurrentHouseID());
            console.log(result);
            this.editMode = false;
        } else {
            this.newsItem = newsItem;
            this.editMode = true;

            this.pageScrollService.start(this.pageScrollInstanceEditingArea);
        }
    }

    onGoToPreview() {
        const pageScrollInstanceNewItem = PageScrollInstance.newInstance(
            {
                document: this.document,
                scrollTarget: '#newsItem' + this.newsItem.news_id,
                pageScrollDuration: 300,
                pageScrollOffset: 150
            });
        this.pageScrollService.start(pageScrollInstanceNewItem);
    }

    onGoToPreviewNew() {
        const pageScrollInstanceNewItem = PageScrollInstance.newInstance(
            {
                document: this.document,
                scrollTarget: '#newsItemNew',
                pageScrollDuration: 300,
                pageScrollOffset: 150
            });
        this.pageScrollService.start(pageScrollInstanceNewItem);
    }

    onBackToEdit() {
        this.pageScrollService.start(this.pageScrollInstanceEditingArea);
    }

    onPublicate(newsItem: NewsItem) {
        let result = this.newsService.publicHouseNewsItem(newsItem, this.housesService.getCurrentHouseID(), newsItem.is_public == 'true' ? true : false);
        console.log(result);
    }

    onDelete(newsItem: NewsItem) {
        this.bsModalRef = this.modalService.show(ConfirmationPopupComponent, {
            keyboard: false,
            ignoreBackdropClick: true,
            class: "small-modal-width"
        });
        this.newsItem = newsItem;
        this.confirmationService.openConfirmDialog({
            message: this.translation.translate('General.confirm.deleteNewsItem'),
            details: this.newsItem.title
        });
    }

    defineCollapsed() {
        this.collapsedNews = {};
        this.houseNews.forEach((item) => {
            if (item.text_news.length > 150) {
                this.collapsedNews[item.news_id] = true;
            }
        });
    }

    onChangeState(id: string) {
        this.collapsedNews[id] = !this.collapsedNews[id];
    }


}
