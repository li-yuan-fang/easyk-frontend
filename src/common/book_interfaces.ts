export type {
    BookList,
    BookListItem
}

interface BookList {
    list: Array<BookListItem>;
}

interface BookListItem {
    id: string;
    title: string;
    order: string;
}
