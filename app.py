from flask import Flask, render_template, request, redirect, url_for, flash
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, date, timezone
import os

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'berber-randevu-secret-key')
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get(
    'DATABASE_URL', 'sqlite:///berber_randevu.db'
)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)


# ------------------------------------------------------------------
# Models
# ------------------------------------------------------------------

class Berber(db.Model):
    __tablename__ = 'berber'

    id = db.Column(db.Integer, primary_key=True)
    ad = db.Column(db.String(100), nullable=False)
    uzmanlik = db.Column(db.String(100), nullable=False)  # Berber / Kuaför
    telefon = db.Column(db.String(20), nullable=True)
    aktif = db.Column(db.Boolean, default=True)

    randevular = db.relationship('Randevu', backref='berber', lazy=True)

    def __repr__(self):
        return f'<Berber {self.ad}>'


class Hizmet(db.Model):
    __tablename__ = 'hizmet'

    id = db.Column(db.Integer, primary_key=True)
    ad = db.Column(db.String(100), nullable=False)
    sure_dk = db.Column(db.Integer, nullable=False, default=30)   # dakika
    fiyat = db.Column(db.Float, nullable=False, default=0.0)
    uzmanlik = db.Column(db.String(100), nullable=False)  # Berber / Kuaför / Her İkisi

    randevular = db.relationship('Randevu', backref='hizmet', lazy=True)

    def __repr__(self):
        return f'<Hizmet {self.ad}>'


class Randevu(db.Model):
    __tablename__ = 'randevu'

    id = db.Column(db.Integer, primary_key=True)
    musteri_ad = db.Column(db.String(100), nullable=False)
    musteri_telefon = db.Column(db.String(20), nullable=False)
    berber_id = db.Column(db.Integer, db.ForeignKey('berber.id'), nullable=False)
    hizmet_id = db.Column(db.Integer, db.ForeignKey('hizmet.id'), nullable=False)
    tarih = db.Column(db.Date, nullable=False)
    saat = db.Column(db.Time, nullable=False)
    notlar = db.Column(db.Text, nullable=True)
    durum = db.Column(db.String(20), nullable=False, default='Bekliyor')
    olusturma_tarihi = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def __repr__(self):
        return f'<Randevu {self.musteri_ad} - {self.tarih} {self.saat}>'


# ------------------------------------------------------------------
# Seed data
# ------------------------------------------------------------------

def seed_data():
    if Berber.query.count() == 0:
        berberler = [
            Berber(ad='Ahmet Yılmaz', uzmanlik='Berber', telefon='0532 111 2233'),
            Berber(ad='Mehmet Kaya', uzmanlik='Berber', telefon='0533 222 3344'),
            Berber(ad='Fatma Demir', uzmanlik='Kuaför', telefon='0535 333 4455'),
            Berber(ad='Ayşe Çelik', uzmanlik='Kuaför', telefon='0536 444 5566'),
        ]
        db.session.add_all(berberler)

    if Hizmet.query.count() == 0:
        hizmetler = [
            Hizmet(ad='Saç Kesimi', sure_dk=30, fiyat=100, uzmanlik='Berber'),
            Hizmet(ad='Sakal Kesimi', sure_dk=20, fiyat=80, uzmanlik='Berber'),
            Hizmet(ad='Saç + Sakal', sure_dk=45, fiyat=160, uzmanlik='Berber'),
            Hizmet(ad='Saç Kesimi', sure_dk=45, fiyat=150, uzmanlik='Kuaför'),
            Hizmet(ad='Saç Boyama', sure_dk=90, fiyat=350, uzmanlik='Kuaför'),
            Hizmet(ad='Keratin Bakım', sure_dk=120, fiyat=500, uzmanlik='Kuaför'),
            Hizmet(ad='Fön + Makyaj', sure_dk=60, fiyat=250, uzmanlik='Kuaför'),
        ]
        db.session.add_all(hizmetler)

    db.session.commit()


# ------------------------------------------------------------------
# Routes
# ------------------------------------------------------------------

@app.route('/')
def index():
    berberler = Berber.query.filter_by(aktif=True).all()
    bugun = date.today()
    return render_template('index.html', berberler=berberler, bugun=bugun)


@app.route('/randevu-al', methods=['GET', 'POST'])
def randevu_al():
    berberler = Berber.query.filter_by(aktif=True).all()
    hizmetler = Hizmet.query.all()
    bugun = date.today().isoformat()

    if request.method == 'POST':
        musteri_ad = request.form.get('musteri_ad', '').strip()
        musteri_telefon = request.form.get('musteri_telefon', '').strip()
        berber_id = request.form.get('berber_id')
        hizmet_id = request.form.get('hizmet_id')
        tarih_str = request.form.get('tarih')
        saat_str = request.form.get('saat')
        notlar = request.form.get('notlar', '').strip()

        hatalar = []
        if not musteri_ad:
            hatalar.append('Müşteri adı zorunludur.')
        if not musteri_telefon:
            hatalar.append('Telefon numarası zorunludur.')
        if not berber_id:
            hatalar.append('Lütfen bir berber/kuaför seçiniz.')
        if not hizmet_id:
            hatalar.append('Lütfen bir hizmet seçiniz.')
        if not tarih_str:
            hatalar.append('Tarih seçimi zorunludur.')
        if not saat_str:
            hatalar.append('Saat seçimi zorunludur.')

        if not hatalar:
            try:
                tarih = datetime.strptime(tarih_str, '%Y-%m-%d').date()
                saat = datetime.strptime(saat_str, '%H:%M').time()

                if tarih < date.today():
                    hatalar.append('Geçmiş bir tarih seçilemez.')
                else:
                    # Çakışma kontrolü (Bekliyor veya Onaylandı olan randevular)
                    mevcut = Randevu.query.filter(
                        Randevu.berber_id == berber_id,
                        Randevu.tarih == tarih,
                        Randevu.saat == saat,
                        Randevu.durum.in_(['Bekliyor', 'Onaylandı'])
                    ).first()
                    if mevcut:
                        hatalar.append(
                            'Seçilen berber/kuaför bu saat için zaten bir randevuya sahip. '
                            'Lütfen farklı bir saat seçin.'
                        )
                    else:
                        randevu = Randevu(
                            musteri_ad=musteri_ad,
                            musteri_telefon=musteri_telefon,
                            berber_id=int(berber_id),
                            hizmet_id=int(hizmet_id),
                            tarih=tarih,
                            saat=saat,
                            notlar=notlar,
                        )
                        db.session.add(randevu)
                        db.session.commit()
                        flash(
                            f'Randevunuz başarıyla alındı! Randevu No: #{randevu.id}',
                            'success'
                        )
                        return redirect(url_for('randevu_detay', randevu_id=randevu.id))
            except ValueError:
                hatalar.append('Geçersiz tarih veya saat formatı.')

        for hata in hatalar:
            flash(hata, 'danger')

    hizmetler_json = [
        {
            'id': h.id,
            'ad': h.ad,
            'sure_dk': h.sure_dk,
            'fiyat': h.fiyat,
            'uzmanlik': h.uzmanlik,
        }
        for h in hizmetler
    ]

    return render_template(
        'randevu_al.html',
        berberler=berberler,
        hizmetler=hizmetler,
        hizmetler_json=hizmetler_json,
        bugun=bugun,
    )


@app.route('/randevu/<int:randevu_id>')
def randevu_detay(randevu_id):
    randevu = db.get_or_404(Randevu, randevu_id)
    return render_template('randevu_detay.html', randevu=randevu)


@app.route('/admin')
def admin():
    tarih_filtre = request.args.get('tarih')
    berber_filtre = request.args.get('berber_id')
    durum_filtre = request.args.get('durum')

    sorgu = Randevu.query

    if tarih_filtre:
        try:
            filtre_tarihi = datetime.strptime(tarih_filtre, '%Y-%m-%d').date()
            sorgu = sorgu.filter(Randevu.tarih == filtre_tarihi)
        except ValueError:
            pass

    if berber_filtre:
        sorgu = sorgu.filter(Randevu.berber_id == int(berber_filtre))

    if durum_filtre:
        sorgu = sorgu.filter(Randevu.durum == durum_filtre)

    randevular = sorgu.order_by(Randevu.tarih, Randevu.saat).all()
    berberler = Berber.query.filter_by(aktif=True).all()

    return render_template(
        'admin.html',
        randevular=randevular,
        berberler=berberler,
        tarih_filtre=tarih_filtre or '',
        berber_filtre=berber_filtre or '',
        durum_filtre=durum_filtre or '',
    )


@app.route('/admin/randevu/<int:randevu_id>/durum', methods=['POST'])
def randevu_durum_guncelle(randevu_id):
    randevu = db.get_or_404(Randevu, randevu_id)
    yeni_durum = request.form.get('durum')
    if yeni_durum in ('Bekliyor', 'Onaylandı', 'İptal'):
        randevu.durum = yeni_durum
        db.session.commit()
        flash(f'Randevu #{randevu_id} durumu "{yeni_durum}" olarak güncellendi.', 'success')
    return redirect(url_for('admin'))


@app.route('/api/hizmetler')
def api_hizmetler():
    uzmanlik = request.args.get('uzmanlik')
    if uzmanlik:
        hizmetler = Hizmet.query.filter(
            (Hizmet.uzmanlik == uzmanlik) | (Hizmet.uzmanlik == 'Her İkisi')
        ).all()
    else:
        hizmetler = Hizmet.query.all()

    return {
        'hizmetler': [
            {
                'id': h.id,
                'ad': h.ad,
                'sure_dk': h.sure_dk,
                'fiyat': h.fiyat,
                'uzmanlik': h.uzmanlik,
            }
            for h in hizmetler
        ]
    }


# ------------------------------------------------------------------
# App init
# ------------------------------------------------------------------

with app.app_context():
    db.create_all()
    seed_data()


if __name__ == '__main__':
    debug_mode = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    app.run(debug=debug_mode)
